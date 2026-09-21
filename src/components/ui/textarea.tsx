import * as React from "react";

import { cn } from "@/lib/utils";
import { CONTROL_MULTI_LINE } from "@/components/ui/control-styles";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return <textarea className={cn(CONTROL_MULTI_LINE, className)} ref={ref} {...props} />;
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
