'use client';

/**
 * JuryVerdictPanel Component
 *
 * The verdict submission panel where jurors decide on three charges:
 * - Engine Assistance: Did the player use a chess engine?
 * - Input Automation: Was the input synthetically generated?
 * - External Assistance: Did the player receive help from another person?
 *
 * WHAT THIS COMPONENT DOES:
 * - Displays three charge types with radio buttons for each verdict
 * - Prevents submission until all charges have a verdict
 * - Provides skip option for conflicts of interest
 */

import { useState } from 'react';
import type { VerdictOption, ChargeType } from './mockJuryData';

interface JuryVerdictPanelProps {
  caseId: string;
  onSubmit: (verdicts: Record<ChargeType, VerdictOption>) => void;
  onSkip: () => void;
  isSubmitting?: boolean;
}

interface ChargeConfig {
  type: ChargeType;
  label: string;
  description: string;
}

const CHARGES: ChargeConfig[] = [
  {
    type: 'engine_assistance',
    label: 'Engine Assistance',
    description: 'Statistical evidence suggests moves were selected by or cross-referenced with a chess engine',
  },
  {
    type: 'input_automation',
    label: 'Input Automation',
    description: 'Physical input patterns (mouse/touch) appear synthetically generated or automated',
  },
  {
    type: 'external_assistance',
    label: 'External Assistance',
    description: 'Behavioral patterns suggest moves were provided by another person (coach, spectator)',
  },
];

export function JuryVerdictPanel({
  caseId,
  onSubmit,
  onSkip,
  isSubmitting = false,
}: JuryVerdictPanelProps) {
  const [verdicts, setVerdicts] = useState<Record<ChargeType, VerdictOption | null>>({
    engine_assistance: null,
    input_automation: null,
    external_assistance: null,
  });

  const handleVerdictChange = (charge: ChargeType, verdict: VerdictOption) => {
    setVerdicts((prev) => ({ ...prev, [charge]: verdict }));
  };

  const isComplete = Object.values(verdicts).every((v) => v !== null);

  const handleSubmit = () => {
    if (!isComplete) return;
    onSubmit(verdicts as Record<ChargeType, VerdictOption>);
  };

  return (
    <div className="bg-[#0a0a0a] border border-[#666]/30">
      {/* Header */}
      <div className="p-4 border-b border-[#666]/30">
        <h3 className="text-sm font-mono text-white">verdict_submission</h3>
        <p className="text-xs font-mono text-[#666] mt-0.5">
          case {caseId.toUpperCase()}
        </p>
      </div>

      {/* Charges */}
      <div className="p-4 space-y-4">
        {CHARGES.map((charge) => (
          <ChargeVerdict
            key={charge.type}
            charge={charge}
            selectedVerdict={verdicts[charge.type]}
            onSelect={(verdict) => handleVerdictChange(charge.type, verdict)}
            disabled={isSubmitting}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-[#666]/30 flex items-center justify-between gap-4">
        <button
          onClick={onSkip}
          disabled={isSubmitting}
          className="px-4 py-2 text-xs font-mono text-[#888] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          skip case
        </button>

        <button
          onClick={handleSubmit}
          disabled={!isComplete || isSubmitting}
          className={`px-6 py-2 font-mono text-sm transition-all ${
            isComplete && !isSubmitting
              ? 'bg-white text-black hover:bg-[#ccc]'
              : 'bg-[#666]/30 text-[#666] cursor-not-allowed'
          }`}
        >
          {isSubmitting ? 'submitting...' : 'submit verdict'}
        </button>
      </div>
    </div>
  );
}

/**
 * Individual charge with verdict options.
 */
function ChargeVerdict({
  charge,
  selectedVerdict,
  onSelect,
  disabled,
}: {
  charge: ChargeConfig;
  selectedVerdict: VerdictOption | null;
  onSelect: (verdict: VerdictOption) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* Charge label and description */}
      <div>
        <p className="text-sm font-mono text-white">{charge.label}</p>
        <p className="text-xs font-mono text-[#666] mt-0.5">{charge.description}</p>
      </div>

      {/* Verdict options */}
      <div className="flex gap-2">
        <VerdictButton
          label="insufficient"
          sublabel="Not enough evidence"
          isSelected={selectedVerdict === 'insufficient'}
          onClick={() => onSelect('insufficient')}
          disabled={disabled}
          variant="insufficient"
        />
        <VerdictButton
          label="evident"
          sublabel="Beyond reasonable doubt"
          isSelected={selectedVerdict === 'evident'}
          onClick={() => onSelect('evident')}
          disabled={disabled}
          variant="evident"
        />
      </div>
    </div>
  );
}

/**
 * Styled button for verdict selection.
 */
function VerdictButton({
  label,
  sublabel,
  isSelected,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  sublabel: string;
  isSelected: boolean;
  onClick: () => void;
  disabled: boolean;
  variant: 'insufficient' | 'evident';
}) {
  // Base styles
  const baseStyles = 'flex-1 px-4 py-3 text-left border transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed';

  // Variant-specific selected/unselected styles
  const getStyles = () => {
    if (isSelected) {
      if (variant === 'insufficient') {
        return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400';
      }
      return 'bg-red-500/20 border-red-500/50 text-red-400';
    }
    return 'bg-black border-[#666]/30 text-[#888] hover:border-white/30 hover:text-white';
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${getStyles()}`}
    >
      <span className="block text-xs uppercase tracking-wide">{label}</span>
      <span className={`block text-[10px] mt-0.5 ${isSelected ? 'opacity-80' : 'text-[#666]'}`}>
        {sublabel}
      </span>
    </button>
  );
}

export default JuryVerdictPanel;
