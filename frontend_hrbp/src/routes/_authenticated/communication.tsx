import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { consultants, emailTemplates, sentEmails } from "@/lib/mockData";
import { Send, Save, Calendar, Wand2 } from "lucide-react";
import { toast } from "react-toastify";

export const Route = createFileRoute("/_authenticated/communication")({ component: CommHub });

function classify(text: string) {
  const t = text.toLowerCase();
  if (/resign|moving on|last day|new opportunity/.test(t))
    return { intent: "Resignation", sop: "SOP-2 Resignation", urgency: "High" };
  if (/abscond|not reachable|no response/.test(t))
    return { intent: "Absconding", sop: "SOP-7 Absconding", urgency: "Critical" };
  if (/convert|full[- ]time|absorb/.test(t))
    return { intent: "Conversion", sop: "SOP-4 Conversion", urgency: "Medium" };
  if (/hospital|medical|surgery|leave for treatment/.test(t))
    return { intent: "Medical emergency", sop: "SOP-8 Medical", urgency: "High" };
  return { intent: "Routine update", sop: "—", urgency: "Low" };
}

function CommHub() {
  const [cId, setCId] = useState("");
  const [tplId, setTplId] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const [inbound, setInbound] = useState("");

  const consultant = consultants.find((c) => c.id === cId);
  const tpl = emailTemplates.find((t) => t.id === tplId);

  const applyTemplate = (id: string) => {
    setTplId(id);
    const t = emailTemplates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(
      t.body
        .replace(/{{name}}/g, consultant?.name ?? "{{name}}")
        .replace(/{{client}}/g, "your client"),
    );
  };

  const classification = useMemo(() => (inbound ? classify(inbound) : null), [inbound]);

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        title="Communication Hub"
        subtitle="Outbound templates, inbound triage, and full sent history."
      />
      <main className="flex-1 p-6 space-y-6">
        <Tabs defaultValue="outbound">
          <TabsList>
            <TabsTrigger value="outbound">Outbound</TabsTrigger>
            <TabsTrigger value="inbound">Inbound triage</TabsTrigger>
            <TabsTrigger value="history">Sent history</TabsTrigger>
          </TabsList>

          <TabsContent value="outbound" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Consultant</Label>
                      <Select value={cId} onValueChange={setCId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select consultant" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {consultants.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Template</Label>
                      <Select value={tplId} onValueChange={applyTemplate}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick template" />
                        </SelectTrigger>
                        <SelectContent>
                          {emailTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>CC</Label>
                    <Input
                      placeholder="manager@client.com, bh@j2w.io"
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Subject</Label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Subject"
                    />
                  </div>
                  <div>
                    <Label>Body</Label>
                    <Textarea
                      rows={10}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write or pick a template..."
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={whatsapp} onCheckedChange={setWhatsapp} id="wa" />
                    <Label htmlFor="wa" className="cursor-pointer">
                      Also send via WhatsApp
                    </Label>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button onClick={() => toast.success("Email sent")}>
                      <Send className="h-4 w-4 mr-1" />
                      Send
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => toast.success("Scheduled for 9:00 tomorrow")}
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      Schedule
                    </Button>
                    <Button variant="outline" onClick={() => toast.success("Draft saved")}>
                      <Save className="h-4 w-4 mr-1" />
                      Save draft
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Templates</h4>
                  <div className="space-y-2">
                    {emailTemplates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t.id)}
                        className={`w-full text-left border rounded-md p-3 hover:bg-accent transition-colors ${tplId === t.id ? "border-primary bg-accent" : ""}`}
                      >
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.category}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inbound" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h4 className="font-semibold">Paste inbound email</h4>
                  <Textarea
                    rows={12}
                    value={inbound}
                    onChange={(e) => setInbound(e.target.value)}
                    placeholder="Paste the email body here..."
                  />
                  <Button
                    variant="outline"
                    onClick={() => toast.success(`Ticket opened: ${classification?.sop}`)}
                    disabled={!classification}
                  >
                    <Wand2 className="h-4 w-4 mr-1" />
                    Open ticket from email
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Auto-classification</h4>
                  {!classification && (
                    <p className="text-sm text-muted-foreground">
                      Paste an email to detect intent, SOP and urgency.
                    </p>
                  )}
                  {classification && (
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Intent</span>
                        <Badge variant="outline">{classification.intent}</Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">SOP type</span>
                        <Badge variant="outline">{classification.sop}</Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Urgency</span>
                        <Badge variant="outline">{classification.urgency}</Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sentEmails.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{e.date}</TableCell>
                      <TableCell className="text-xs">{e.template}</TableCell>
                      <TableCell className="text-xs">{e.recipient}</TableCell>
                      <TableCell className="text-xs">{e.subject}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {e.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
