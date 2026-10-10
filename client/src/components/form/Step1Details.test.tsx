import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Step1Details, type Step1FormData } from './Step1Details.js';

describe('Step1Details Component', () => {
  const defaultData: Step1FormData = {
    fullName: '',
    mobileNumber: '',
    grossWeightGrams: '',
    netWeightGrams: '',
    karat: 22,
  };

  it('renders all form input fields with initial state', () => {
    render(<Step1Details initialData={defaultData} onNext={vi.fn()} />);

    expect(screen.getByLabelText(/Applicant Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/10-Digit Mobile Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Gross Weight/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Net Gold Weight/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /22 Karat/i })).toBeInTheDocument();
  });

  it('shows validation errors when submitting an empty form', () => {
    const handleNext = vi.fn();
    render(<Step1Details initialData={defaultData} onNext={handleNext} />);

    fireEvent.click(screen.getByRole('button', { name: /Calculate Live Quote/i }));

    expect(screen.getByText(/Full name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Mobile number is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Gross weight is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Net weight is required/i)).toBeInTheDocument();
    expect(handleNext).not.toHaveBeenCalled();
  });

  it('validates applicant name rules (length, characters, spaces)', () => {
    render(<Step1Details initialData={defaultData} onNext={vi.fn()} />);
    const nameInput = screen.getByLabelText(/Applicant Full Name/i);

    // Too short
    fireEvent.change(nameInput, { target: { value: 'A' } });
    fireEvent.blur(nameInput);
    expect(screen.getByText(/Full name must be at least 2 characters/i)).toBeInTheDocument();

    // Invalid characters (numbers / special chars)
    fireEvent.change(nameInput, { target: { value: 'John123' } });
    fireEvent.blur(nameInput);
    expect(screen.getByText(/Full name must contain only English letters and spaces/i)).toBeInTheDocument();
  });

  it('validates Indian 10-digit mobile number rules', () => {
    render(<Step1Details initialData={defaultData} onNext={vi.fn()} />);
    const mobileInput = screen.getByLabelText(/10-Digit Mobile Number/i);

    // Starts with invalid digit (< 6)
    fireEvent.change(mobileInput, { target: { value: '5555555555' } });
    fireEvent.blur(mobileInput);
    expect(
      screen.getByText(/Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9/i)
    ).toBeInTheDocument();

    // Less than 10 digits
    fireEvent.change(mobileInput, { target: { value: '98765' } });
    fireEvent.blur(mobileInput);
    expect(
      screen.getByText(/Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9/i)
    ).toBeInTheDocument();
  });

  it('enforces net weight <= gross weight and positive numbers', () => {
    render(<Step1Details initialData={defaultData} onNext={vi.fn()} />);
    const grossInput = screen.getByLabelText(/Gross Weight/i);
    const netInput = screen.getByLabelText(/Net Gold Weight/i);

    fireEvent.change(grossInput, { target: { value: '30.00' } });
    fireEvent.change(netInput, { target: { value: '35.00' } });
    fireEvent.blur(netInput);

    expect(screen.getByText(/Net weight cannot exceed gross weight/i)).toBeInTheDocument();
  });

  it('allows karat selection switching (18K, 22K, 24K)', () => {
    render(<Step1Details initialData={defaultData} onNext={vi.fn()} />);

    const karat18Btn = screen.getByRole('radio', { name: /18 Karat/i });
    const karat24Btn = screen.getByRole('radio', { name: /24 Karat/i });

    fireEvent.click(karat18Btn);
    expect(karat18Btn).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(karat24Btn);
    expect(karat24Btn).toHaveAttribute('aria-checked', 'true');
    expect(karat18Btn).toHaveAttribute('aria-checked', 'false');
  });

  it('submits valid data to onNext handler', () => {
    const handleNext = vi.fn();
    render(<Step1Details initialData={defaultData} onNext={handleNext} />);

    fireEvent.change(screen.getByLabelText(/Applicant Full Name/i), {
      target: { value: 'Priya Sharma' },
    });
    fireEvent.change(screen.getByLabelText(/10-Digit Mobile Number/i), {
      target: { value: '9876543210' },
    });
    fireEvent.change(screen.getByLabelText(/Gross Weight/i), {
      target: { value: '50.00' },
    });
    fireEvent.change(screen.getByLabelText(/Net Gold Weight/i), {
      target: { value: '45.00' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /22 Karat/i }));

    fireEvent.click(screen.getByRole('button', { name: /Calculate Live Quote/i }));

    expect(handleNext).toHaveBeenCalledWith({
      fullName: 'Priya Sharma',
      mobileNumber: '9876543210',
      grossWeightGrams: '50.00',
      netWeightGrams: '45.00',
      karat: 22,
    });
  });

  it('displays external server API field errors if provided', () => {
    render(
      <Step1Details
        initialData={defaultData}
        onNext={vi.fn()}
        apiErrors={{ mobileNumber: 'Server rejected this mobile number' }}
      />
    );

    expect(screen.getByText(/Server rejected this mobile number/i)).toBeInTheDocument();
  });
});
