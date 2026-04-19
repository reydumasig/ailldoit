import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import type { PhotoProject } from "@shared/schema";

/**
 * /photos/new — minimal create-project form.
 *
 * Upload happens on the next screen (/photos/:id), not here. This page just
 * captures the metadata (name + optional address) so we have a container to
 * attach the source photos + EXIF to once drag-drop lands.
 */
export default function PhotosNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [addressLine, setAddressLine] = useState("");

  const createProject = useMutation<{ project: PhotoProject }, Error, { name: string; addressLine: string | null }>({
    mutationFn: async (payload) => {
      const res = await apiRequest("POST", "/api/photo/projects", payload);
      return (await res.json()) as { project: PhotoProject };
    },
    onSuccess: ({ project }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/photo/projects"] });
      toast({
        title: "Project created",
        description: `"${project.name}" is ready for uploads.`,
      });
      setLocation(`/photos/${project.id}`);
    },
    onError: (err) => {
      toast({
        title: "Couldn't create project",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({
        title: "Name required",
        description: "Give this shoot a name so you can find it later.",
        variant: "destructive",
      });
      return;
    }
    createProject.mutate({
      name: trimmedName,
      addressLine: addressLine.trim() || null,
    });
  };

  return (
    <div className="flex-1 overflow-hidden">
      <header className="bg-white shadow-sm border-b border-gray-200 px-8 py-4">
        <div className="flex items-center gap-3">
          <Link href="/photos">
            <Button variant="ghost" size="sm" className="text-ailldoit-muted">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Photos
            </Button>
          </Link>
          <h2 className="text-2xl font-bold text-ailldoit-black">New Project</h2>
        </div>
      </header>

      <main className="p-8 max-w-2xl">
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-ailldoit-accent/10 flex items-center justify-center text-ailldoit-accent">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-ailldoit-black">Start a shoot</h3>
                <p className="text-sm text-ailldoit-muted">You'll upload photos on the next screen.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  placeholder="123 Main St — Listing shoot"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  maxLength={200}
                  className="mt-1"
                />
                <p className="text-xs text-ailldoit-muted mt-1">
                  Use the address or the listing ref — makes it easy to find later.
                </p>
              </div>

              <div>
                <Label htmlFor="project-address">Property address (optional)</Label>
                <Input
                  id="project-address"
                  placeholder="123 Main St, Springfield"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  maxLength={500}
                  className="mt-1"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Link href="/photos">
                  <Button type="button" variant="ghost">Cancel</Button>
                </Link>
                <Button
                  type="submit"
                  className="bg-ailldoit-accent hover:bg-ailldoit-accent/90 text-white"
                  disabled={createProject.isPending}
                >
                  {createProject.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create project"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
