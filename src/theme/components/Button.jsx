export function Button({
  variant = "ghost",
  size,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const classes = [
    "km-btn",
    variant === "primary" ? "km-btn-primary" : "",
    variant === "danger" ? "km-btn-danger" : "",
    variant === "ghost" ? "km-btn-ghost" : "",
    size === "sm" ? "km-btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
