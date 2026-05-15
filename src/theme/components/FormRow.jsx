import { forwardRef } from "react";

export function FormRow({
  label,
  help,
  error,
  required,
  children,
  className = "",
}) {
  return (
    <label className={`km-form-row ${className}`}>
      {label ? (
        <div className="km-form-label">
          {label}
          {required ? " *" : null}
        </div>
      ) : null}
      {children}
      {help ? <div className="km-form-help">{help}</div> : null}
      {error ? <div className="km-form-error">{error}</div> : null}
    </label>
  );
}

export const TextInput = forwardRef(function TextInput(
  { className = "", ...rest },
  ref,
) {
  return <input ref={ref} className={`km-form-input ${className}`} {...rest} />;
});

export const TextArea = forwardRef(function TextArea(
  { className = "", ...rest },
  ref,
) {
  return (
    <textarea ref={ref} className={`km-form-textarea ${className}`} {...rest} />
  );
});

export const Select = forwardRef(function Select(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={`km-form-select ${className}`} {...rest}>
      {children}
    </select>
  );
});
