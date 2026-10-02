/** The UsageLedger mark: three ledger rows of falling length on the accent square. */
export default function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="var(--acc)" />
      <rect x="7" y="8" width="18" height="3" rx="1.5" fill="#fff" />
      <rect x="7" y="14.5" width="12" height="3" rx="1.5" fill="#fff" />
      <rect x="7" y="21" width="7" height="3" rx="1.5" fill="#fff" />
    </svg>
  );
}
