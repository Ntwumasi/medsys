// Vital Signs Validation Ranges and Utilities

export interface VitalSignsRanges {
  min: number;
  max: number;
  criticalMin?: number;
  criticalMax?: number;
  unit: string;
}

export const VITAL_SIGNS_RANGES = {
  temperature_F: {
    min: 95,
    max: 105,
    criticalMin: 96,
    criticalMax: 103,
    unit: '°F',
  },
  temperature_C: {
    min: 35,
    max: 41,
    criticalMin: 36,
    criticalMax: 40,
    unit: '°C',
  },
  heart_rate: {
    min: 40,
    max: 200,
    criticalMin: 50,
    criticalMax: 120,
    unit: 'bpm',
  },
  blood_pressure_systolic: {
    min: 70,
    max: 250,
    criticalMin: 90,
    criticalMax: 180,
    unit: 'mmHg',
  },
  blood_pressure_diastolic: {
    min: 40,
    max: 150,
    criticalMin: 60,
    criticalMax: 110,
    unit: 'mmHg',
  },
  respiratory_rate: {
    min: 8,
    max: 50,
    criticalMin: 12,
    criticalMax: 25,
    unit: 'breaths/min',
  },
  oxygen_saturation: {
    min: 70,
    max: 100,
    criticalMin: 90,
    criticalMax: 100,
    unit: '%',
  },
  weight_kg: {
    min: 0.5,
    max: 300,
    unit: 'kg',
  },
  weight_lbs: {
    min: 1,
    max: 660,
    unit: 'lbs',
  },
  height_cm: {
    min: 30,
    max: 250,
    unit: 'cm',
  },
  height_in: {
    min: 12,
    max: 100,
    unit: 'in',
  },
};

export interface ValidationResult {
  isValid: boolean;
  isCritical: boolean;
  message?: string;
  severity?: 'normal' | 'warning' | 'critical';
}

export function validateVitalSign(
  value: number,
  vitalType: keyof typeof VITAL_SIGNS_RANGES
): ValidationResult {
  const ranges = VITAL_SIGNS_RANGES[vitalType];

  if (!ranges) {
    return {
      isValid: false,
      isCritical: false,
      message: 'Unknown vital sign type',
      severity: 'normal',
    };
  }

  // Check if value is within absolute bounds
  if (value < ranges.min || value > ranges.max) {
    return {
      isValid: false,
      isCritical: true,
      message: `Value must be between ${ranges.min} and ${ranges.max} ${ranges.unit}`,
      severity: 'critical',
    };
  }

  // Check if value is within critical ranges (if defined)
  if (ranges.criticalMin !== undefined && ranges.criticalMax !== undefined) {
    if (value < ranges.criticalMin || value > ranges.criticalMax) {
      return {
        isValid: true,
        isCritical: true,
        message: `Warning: Value is outside normal range (${ranges.criticalMin}-${ranges.criticalMax} ${ranges.unit})`,
        severity: 'critical',
      };
    }
  }

  return {
    isValid: true,
    isCritical: false,
    message: 'Normal',
    severity: 'normal',
  };
}

export function validateAllVitals(vitals: {
  temperature?: number;
  temperature_unit?: 'C' | 'F';
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  weight_unit?: 'kg' | 'lbs';
  height?: number;
  height_unit?: 'cm' | 'in';
}): {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
  criticalValues: string[];
} {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const criticalValues: string[] = [];

  // Validate temperature
  if (vitals.temperature !== undefined) {
    const tempType =
      vitals.temperature_unit === 'C' ? 'temperature_C' : 'temperature_F';
    const result = validateVitalSign(vitals.temperature, tempType);

    if (!result.isValid) {
      errors.temperature = result.message || 'Invalid temperature';
    } else if (result.isCritical) {
      warnings.temperature = result.message || 'Temperature is critical';
      criticalValues.push('Temperature');
    }
  }

  // Validate heart rate
  if (vitals.heart_rate !== undefined) {
    const result = validateVitalSign(vitals.heart_rate, 'heart_rate');

    if (!result.isValid) {
      errors.heart_rate = result.message || 'Invalid heart rate';
    } else if (result.isCritical) {
      warnings.heart_rate = result.message || 'Heart rate is critical';
      criticalValues.push('Heart Rate');
    }
  }

  // Validate blood pressure
  if (vitals.blood_pressure_systolic !== undefined) {
    const result = validateVitalSign(
      vitals.blood_pressure_systolic,
      'blood_pressure_systolic'
    );

    if (!result.isValid) {
      errors.blood_pressure_systolic = result.message || 'Invalid systolic BP';
    } else if (result.isCritical) {
      warnings.blood_pressure_systolic = result.message || 'Systolic BP is critical';
      criticalValues.push('Systolic BP');
    }
  }

  if (vitals.blood_pressure_diastolic !== undefined) {
    const result = validateVitalSign(
      vitals.blood_pressure_diastolic,
      'blood_pressure_diastolic'
    );

    if (!result.isValid) {
      errors.blood_pressure_diastolic = result.message || 'Invalid diastolic BP';
    } else if (result.isCritical) {
      warnings.blood_pressure_diastolic =
        result.message || 'Diastolic BP is critical';
      criticalValues.push('Diastolic BP');
    }
  }

  // Validate respiratory rate
  if (vitals.respiratory_rate !== undefined) {
    const result = validateVitalSign(vitals.respiratory_rate, 'respiratory_rate');

    if (!result.isValid) {
      errors.respiratory_rate = result.message || 'Invalid respiratory rate';
    } else if (result.isCritical) {
      warnings.respiratory_rate = result.message || 'Respiratory rate is critical';
      criticalValues.push('Respiratory Rate');
    }
  }

  // Validate oxygen saturation
  if (vitals.oxygen_saturation !== undefined) {
    const result = validateVitalSign(vitals.oxygen_saturation, 'oxygen_saturation');

    if (!result.isValid) {
      errors.oxygen_saturation = result.message || 'Invalid oxygen saturation';
    } else if (result.isCritical) {
      warnings.oxygen_saturation = result.message || 'Oxygen saturation is critical';
      criticalValues.push('Oxygen Saturation');
    }
  }

  // Validate weight
  if (vitals.weight !== undefined) {
    const weightType =
      vitals.weight_unit === 'kg' ? 'weight_kg' : 'weight_lbs';
    const result = validateVitalSign(vitals.weight, weightType);

    if (!result.isValid) {
      errors.weight = result.message || 'Invalid weight';
    }
  }

  // Validate height
  if (vitals.height !== undefined) {
    const heightType =
      vitals.height_unit === 'cm' ? 'height_cm' : 'height_in';
    const result = validateVitalSign(vitals.height, heightType);

    if (!result.isValid) {
      errors.height = result.message || 'Invalid height';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
    criticalValues,
  };
}
