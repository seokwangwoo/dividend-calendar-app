export function FormField({
  label,
  htmlFor,
  children,
  description,
  error
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  description?: string;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {description ? <p className="text-xs text-muted">{description}</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
