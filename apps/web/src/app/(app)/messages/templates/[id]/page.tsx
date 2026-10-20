import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getTemplate, MERGE_TAGS, TEMPLATE_PURPOSES } from "@/lib/services/templates";
import { TemplateForm } from "@/components/TemplateForm";
import { deleteTemplateAction, saveTemplateAction } from "../../actions";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("send_messages");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTemplate(user.accountId, id);
  if (!t) notFound();
  return (
    <>
      <div className="spread"><h1>{t.name}</h1><Link className="btn" href="/messages/templates">Back</Link></div>
      <section className="panel" style={{ maxWidth: 820 }}>
        <TemplateForm action={saveTemplateAction.bind(null, t.id)} d={t} purposes={TEMPLATE_PURPOSES} tags={MERGE_TAGS} />
        <form action={deleteTemplateAction.bind(null, t.id)} style={{ marginTop: 12 }}>
          <button className="btn small danger">Delete template</button>
        </form>
      </section>
    </>
  );
}
