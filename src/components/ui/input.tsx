import * as React from "react";

import { cn } from "@/lib/utils";
import { CONTROL_SINGLE_LINE, NATIVE_PICKER_ICON } from "@/components/ui/control-styles";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          CONTROL_SINGLE_LINE,
          NATIVE_PICKER_ICON,
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
