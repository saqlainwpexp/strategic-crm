/** Body text for every "delete lead(s)" confirmation — same wording in calling and email. */
export function DeleteLeadsWarning({ count }: { count: number }) {
  const one = count === 1;
  return (
    <>
      <p>
        {one ? "This lead is" : `These ${count.toLocaleString("en-US")} leads are`} permanently removed from <b className="font-medium text-ink">both</b> the Cold Calling CRM and Email Marketing, together with{" "}
        {one ? "its" : "their"} call history, meetings, payments and workflow progress.
      </p>
      <p className="mt-3">Campaign stats and inbox replies are kept, just no longer linked. This can't be undone.</p>
    </>
  );
}
