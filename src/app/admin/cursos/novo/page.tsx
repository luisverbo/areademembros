import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { NewCourseForm } from "./new-course-form";

export const metadata: Metadata = { title: "Novo curso" };

export default async function NewCoursePage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Novo curso" back={{ href: "/admin/cursos", label: "Cursos" }} />
      <Card>
        <NewCourseForm />
      </Card>
    </>
  );
}
