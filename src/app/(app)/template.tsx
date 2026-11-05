/**
 * Brief fade/rise on navigation, in CSS so pages don't need the animation library to show it. A
 * template remounts on every navigation, so the animation plays each time. The reduced-motion
 * rules in globals.css collapse it.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="pp-page-enter flex flex-col gap-6">{children}</div>;
}
