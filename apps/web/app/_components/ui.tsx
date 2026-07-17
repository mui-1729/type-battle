import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "icon";

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  variant?: ButtonVariant;
};

type ButtonProps = ButtonBaseProps &
  ({ iconOnly?: false } | { iconOnly: true; "aria-label": string });

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", iconOnly = false, className = "", ...props },
  ref
) {
  const classes = [
    variant === "primary" ? "primaryButton" : variant === "icon" ? "iconButton" : "secondaryButton",
    "uiButton",
    iconOnly ? "uiButtonIcon" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return <button ref={ref} className={classes} {...props} />;
});

type SurfaceCardProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export function SurfaceCard({ className = "", children, ...props }: SurfaceCardProps) {
  return (
    <div className={`uiCard ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  id?: string;
};

export function SectionHeading({ eyebrow, title, description, id }: SectionHeadingProps) {
  return (
    <div className="sectionHeading">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 id={id}>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
