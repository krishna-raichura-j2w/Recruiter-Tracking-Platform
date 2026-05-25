import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { consultants } from "@/lib/mockData";
import { toast } from "react-toastify";

const sops = [
  "SOP-2 Resignation",
  "SOP-3 Contract Renewal",
  "SOP-4 Conversion",
  "SOP-5 PIP",
  "SOP-6 Misconduct",
  "SOP-7 Absconding",
  "SOP-8 Medical",
  "Rate Revision",
  "Hike Planning",
];

export function NewTicketDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [sop, setSop] = useState("");
  const [cId, setCId] = useState("");
  const [src, setSrc] = useState("");
  const [desc, setDesc] = useState("");

  const create = () => {
    if (!sop || !cId) {
      toast.error("Pick SOP and consultant");
      return;
    }
    toast.success(`Ticket created for ${consultants.find((c) => c.id === cId)?.name}`);
    onOpenChange(false);
    setSop("");
    setCId("");
    setSrc("");
    setDesc("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create new ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>SOP type</Label>
            <Select value={sop} onValueChange={setSop}>
              <SelectTrigger>
                <SelectValue placeholder="Select SOP" />
              </SelectTrigger>
              <SelectContent>
                {sops.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Consultant</Label>
            <Select value={cId} onValueChange={setCId}>
              <SelectTrigger>
                <SelectValue placeholder="Select consultant" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {consultants.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.empId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Source</Label>
            <Select value={src} onValueChange={setSrc}>
              <SelectTrigger>
                <SelectValue placeholder="Where did this come from?" />
              </SelectTrigger>
              <SelectContent>
                {["Email", "Slack", "BH flag", "System signal", "Phone call"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Brief context..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create}>Create ticket</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
