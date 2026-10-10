import { prisma } from '../config/db.js';
import { calculateFinancialQuote } from '../core/financial-maths.js';
import { DuplicateApplicationError, NotFoundError } from '../core/errors.js';
import { maskMobileNumber } from '../utils/serialization.js';
import type { LeadCreationInput, LeadQueryInput } from '../schemas/loan.schema.js';

export interface LeadCreationResponse {
  applicationId: string;
  status: string;
  fullName: string;
  pureGoldGrams: number;
  eligibleLoanRupees: number;
  createdAt: string;
}

export interface AdminLeadItem {
  id: string;
  fullName: string;
  maskedMobile: string;
  grossWeightGrams: number;
  netWeightGrams: number;
  karat: number;
  pureGoldGrams: number;
  eligibleLoanRupees: number;
  selectedPlanId: string;
  status: string;
  createdAt: string;
}

export class LeadService {
  /**
   * Persists a new lead with server-side recalculated financials,
   * database-backed sequence ID, and 7-day de-duplication check.
   */
  static async createLead(input: LeadCreationInput): Promise<LeadCreationResponse> {
    const cleanMobile = input.mobileNumber.replace(/\D/g, '').slice(-10);

    // 1. Verify scheme existence and active status
    const scheme = await prisma.loanScheme.findUnique({
      where: { id: input.selectedPlanId },
    });

    if (!scheme || !scheme.isActive) {
      throw new NotFoundError(
        `Selected loan scheme '${input.selectedPlanId}' does not exist or is inactive.`,
        [
          {
            field: 'selectedPlanId',
            message: `Loan scheme '${input.selectedPlanId}' not found or inactive`,
          },
        ],
        'PLAN_NOT_FOUND'
      );
    }

    // 2. Execute duplicate check, ID generation, and lead creation inside a transaction
    return await prisma.$transaction(async (tx) => {
      // Concurrency lock on applicant's mobile number
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cleanMobile}));`;

      // 7-day de-duplication check
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const existing = await tx.lead.findFirst({
        where: {
          mobileNumber: cleanMobile,
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        throw new DuplicateApplicationError(existing.id, existing.createdAt);
      }

      // Authoritative server-side financial calculation (client amounts ignored)
      const calculation = calculateFinancialQuote({
        grossWeightGrams: input.grossWeightGrams,
        netWeightGrams: input.netWeightGrams,
        karat: input.karat,
        maxLtv: scheme.maxLtv.toNumber(),
      });

      // Collision-safe sequence ID generation
      const seqRows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('lead_application_id_seq');`;
      const nextval = seqRows[0].nextval;
      const applicationId = `GL-${nextval}`;

      const created = await tx.lead.create({
        data: {
          id: applicationId,
          fullName: input.fullName.trim(),
          mobileNumber: cleanMobile,
          grossWeightGrams: input.grossWeightGrams,
          netWeightGrams: input.netWeightGrams,
          karat: input.karat,
          pureGoldGrams: calculation.pureGoldGrams,
          goldValuePaise: calculation.goldValuePaise,
          eligibleLoanPaise: calculation.eligibleLoanPaise,
          selectedPlanId: scheme.id,
          status: 'SUBMITTED',
        },
      });

      return {
        applicationId: created.id,
        status: created.status,
        fullName: created.fullName,
        pureGoldGrams: Number(created.pureGoldGrams),
        eligibleLoanRupees: calculation.eligibleLoanRupees,
        createdAt: created.createdAt.toISOString(),
      };
    });
  }

  /**
   * Retrieves leads for administrative view, ordered newest first with masked mobile numbers.
   */
  static async getLeads(query?: LeadQueryInput): Promise<{ leads: AdminLeadItem[] }> {
    const whereClause: Record<string, any> = {};
    if (query?.planId) {
      whereClause.selectedPlanId = query.planId;
    }

    const records = await prisma.lead.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    const leads: AdminLeadItem[] = records.map((record) => ({
      id: record.id,
      fullName: record.fullName,
      maskedMobile: maskMobileNumber(record.mobileNumber),
      grossWeightGrams: Number(record.grossWeightGrams),
      netWeightGrams: Number(record.netWeightGrams),
      karat: record.karat,
      pureGoldGrams: Number(record.pureGoldGrams),
      eligibleLoanRupees: Number(record.eligibleLoanPaise) / 100,
      selectedPlanId: record.selectedPlanId,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
    }));

    return { leads };
  }

  /**
   * Fetches active loan schemes from the database.
   */
  static async getLoanSchemes() {
    const schemes = await prisma.loanScheme.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });

    return {
      schemes: schemes.map((s) => ({
        id: s.id,
        name: s.name,
        interestRateAnnual: Number(s.interestRateAnnual),
        maxLtv: Number(s.maxLtv),
        tenureMonths: s.tenureMonths,
        description: s.description,
        isActive: s.isActive,
      })),
    };
  }
}
