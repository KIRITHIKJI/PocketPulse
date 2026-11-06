import { Field } from "@/components/forms/form-parts";

/** The full form's free-text extras: note and tags. Uncontrolled; sent with the form. */
export function NoteAndTagsFields({
  note,
  tags,
  errors,
}: {
  note: string;
  tags: string;
  errors: Partial<Record<string, string>>;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="entry-note" className="text-sm font-medium">
          Note
        </label>
        <textarea
          id="entry-note"
          name="note"
          defaultValue={note}
          maxLength={1000}
          rows={2}
          aria-invalid={errors.note ? true : undefined}
          className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
        />
        {errors.note && <p className="text-sm text-destructive">{errors.note}</p>}
      </div>
      <Field
        id="entry-tags"
        name="tags"
        label="Tags"
        placeholder="e.g. project, trip"
        defaultValue={tags}
        autoComplete="off"
        hint="Separate tags with commas."
        error={errors.tags}
      />
    </>
  );
}
