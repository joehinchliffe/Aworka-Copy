import Link from "next/link";
import { requireUser } from "@/lib/session";
import { MERGE_TAGS, TEMPLATE_PURPOSES } from "@/lib/services/templates";
import { TemplateForm } from "@/components/TemplateForm";
import { saveTemplateAction } from "../../actions";

export default async function NewTemplatePage() {
  await requireUser("send_messages");
  return (
    <>
      <div className="spread"><h1>New template</h1><Link className="btn" href="/messages/templates">Back</Link></div>
      <section className="panel" style={{ maxWidth: 820 }}>
        <TemplateForm action={saveTemplateAction.bind(null, null)} purposes={TEMPLATE_PURPOSES} tags={MERGE_TAGS} />
      </section>
    </>
  );
}
