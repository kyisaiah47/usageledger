import { MARK_INNER, MARK_VIEWBOX } from '@/icons/mark.generated';

/** The UsageLedger mark. The drawing lives in icons/mark.generated.ts, which is generated from the
 * same registry file as the tab icon, so the header and the tab paint one drawing. */
export default function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: MARK_INNER }}
    />
  );
}
