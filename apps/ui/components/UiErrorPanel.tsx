export function UiErrorPanel(props: { title: string; message: string; details?: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
      <div className="font-medium">{props.title}</div>
      <div className="mt-1 text-red-100">{props.message}</div>
      <div className="mt-3 text-xs text-red-100/90">
        Fixes:
        <ul className="mt-1 list-disc pl-5">
          <li>
            Set <code className="rounded bg-red-950/40 px-1">A5C_REPO</code> and restart the UI process
          </li>
          <li>
            Or run <code className="rounded bg-red-950/40 px-1">node scripts/local-bringup.mjs</code> from the repo root
          </li>
        </ul>
      </div>
      {props.details ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-red-100/80">Details</summary>
          <pre className="mt-2 overflow-auto rounded bg-red-950/30 p-2 text-xs text-red-50">{props.details}</pre>
        </details>
      ) : null}
    </div>
  );
}



