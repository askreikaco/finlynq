import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Loader<P> = () => Promise<{ default: ComponentType<P> } | ComponentType<P>>;
type Options = { ssr?: boolean; loading?: () => ReactNode };

/** next/dynamic replacement: React.lazy + Suspense (everything is client-rendered, `ssr` is moot). */
export default function dynamic<P extends object>(loader: Loader<P>, opts: Options = {}): ComponentType<P> {
  const Lazy = lazy(async () => {
    const m = await loader();
    return "default" in (m as object) ? (m as { default: ComponentType<P> }) : { default: m as ComponentType<P> };
  });
  return function Dynamic(props: P) {
    const L = Lazy as ComponentType<P>;
    return (
      <Suspense fallback={opts.loading ? opts.loading() : null}>
        <L {...props} />
      </Suspense>
    );
  };
}
