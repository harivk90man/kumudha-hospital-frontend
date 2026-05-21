export type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
  className?: string;
}

/**
 * Global progress bar (LinearProgress / GlobalProgressBar) handles all
 * loading feedback. This component intentionally renders nothing so that
 * existing call sites compile without changes while producing no output.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Spinner(_props: SpinnerProps): JSX.Element {
  return <></>;
}
