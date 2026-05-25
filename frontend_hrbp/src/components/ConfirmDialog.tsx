import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[400px] rounded-2xl p-6 border border-slate-100 bg-white/95 backdrop-blur-md shadow-2xl">
        <AlertDialogHeader className="space-y-2">
          <AlertDialogTitle className="text-lg font-bold text-slate-900">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-slate-500 leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-6 flex flex-row justify-end gap-3 sm:space-x-0">
          <AlertDialogCancel className="rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold px-4 py-2 text-sm transition-all duration-200">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
              onOpenChange(false);
            }}
            className={cn(
              "rounded-xl font-semibold px-4 py-2 text-sm text-white transition-all duration-200 cursor-pointer",
              variant === "destructive"
                ? "bg-red-600 hover:bg-red-500 shadow-md shadow-red-600/10"
                : "bg-sky-600 hover:bg-sky-500 shadow-md shadow-sky-600/10",
            )}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
