export function StartWorkspaceButton({
  label = "Start Your Tax Return",
  preferLocalDraft = false
}: {
  label?: string;
  preferLocalDraft?: boolean;
}) {
  return (
    <form action="/returns/new">
      {preferLocalDraft ? (
        <input type="hidden" name="local" value="1" />
      ) : null}
      <button className="launch-button" type="submit">
        {label}
      </button>
    </form>
  );
}
