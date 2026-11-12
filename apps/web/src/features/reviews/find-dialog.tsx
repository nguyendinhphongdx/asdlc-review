import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "../../kernel/page.js";
import { requestReview } from "./api.js";
import { MrPicker } from "./picker.js";

/** Hộp thoại "Tìm MR": chọn repo → chọn MR để review, hoặc dán link. */
export function FindMrDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const m = useMutation({ mutationFn: requestReview, onSuccess: () => { setUrl(""); setOpen(false); void qc.invalidateQueries({ queryKey: ["runs"] }); void qc.invalidateQueries({ queryKey: ["inbox"] }); } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Search />Tìm MR</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tìm MR để review</DialogTitle>
          <DialogDescription>Chọn repo trong tài khoản GitLab rồi chọn MR, hoặc dán link MR.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) m.mutate(url.trim()); }}>
          <Input aria-label="Link MR" className="flex-[1_1_280px]" placeholder="Dán link MR: https://gitlab.example.com/group/project/-/merge_requests/140" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" variant="outline" disabled={m.isPending || !url.trim()}>Review link</Button>
        </form>
        {m.error && <ErrorBox error={m.error} />}
        <MrPicker onSent={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
