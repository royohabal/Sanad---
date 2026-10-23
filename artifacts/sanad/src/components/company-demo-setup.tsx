import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { customFetch, useListCompanyWorkers, getListCompanyWorkersQueryKey } from "@workspace/api-client-react";

export function CompanyDemoSetup({ arabic, basePath }: { arabic: boolean; basePath: string }) {
  const queryClient = useQueryClient();
  const workers = useListCompanyWorkers({ query: { queryKey: getListCompanyWorkersQueryKey() } });
  const [confirm, setConfirm] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const setup = useMutation({
    mutationFn: () => customFetch<{ workerCount: number }>("/api/company/demo-setup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }),
    }),
    onSuccess: () => { setConfirm(false); void queryClient.invalidateQueries(); },
  });
  const openWorker = useMutation({
    mutationFn: (workerId: string) => customFetch(`/api/company/workers/${encodeURIComponent(workerId)}/demo-session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }),
    onSuccess: () => window.location.assign(`${basePath}/worker`),
  });
  if (!workers.data || workers.data.some(worker => !worker.isDemo)) return null;
  const activeWorkers = workers.data.filter(worker => worker.status === "active");
  const demoWorker = activeWorkers.find(worker => worker.id === selectedWorkerId) ?? activeWorkers[0];
  return <section className="surface data-section" data-testid="company-demo-setup">
    <div className="section-heading"><h3>{arabic ? "عرض SANAD التجريبي" : "SANAD demo workspace"}</h3><span className="preview-tag">DEMO</span></div>
    <p>{demoWorker
      ? (arabic ? "هذه سجلات تجريبية محفوظة. المحاكاة تحدّث لوحة الشركة والموظف دون أي دفع حقيقي." : "These are saved demo records. Simulated tips update the company and worker dashboards without a real payment.")
      : (arabic ? "أنشئ فريقاً تجريبياً محفوظاً لتجربة صفحات الإكراميات ولوحات الشركة والموظف. لن تُغيّر أي سجلات حقيقية." : "Create a saved demo team to try tipping and both dashboards. This adds labeled demo records only; it does not change real records.")}</p>
    {demoWorker ? <div className="section-tools">
      <select aria-label={arabic ? "الموظف التجريبي" : "Demo worker"} value={demoWorker.id} onChange={event => setSelectedWorkerId(event.target.value)}>{activeWorkers.map(worker => <option value={worker.id} key={worker.id}>{worker.name}</option>)}</select>
      <Link className="outline-button" href={`/tip/${demoWorker.slug}`} data-testid="link-saved-demo-tip">{arabic ? "فتح صفحة الإكرامية التجريبية" : "Open demo tip page"}</Link>
      <button className="solid-button" data-testid="button-open-demo-worker" disabled={openWorker.isPending} onClick={() => openWorker.mutate(demoWorker.id)}>{arabic ? "فتح لوحة الموظف التجريبية" : "Open worker demo"}</button>
    </div> : <>
      <label className="demo-setup-confirm"><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} data-testid="checkbox-demo-setup"/>{arabic ? "أريد إضافة ٦ موظفين وسجلات إكراميات ورواتب تجريبية إلى مساحة العمل الفارغة هذه. لا تُرسل أي مبالغ." : "Add 6 demo workers, simulated tips, and sample payroll records to this empty workspace. No money is sent."}</label>
      <button className="solid-button" data-testid="button-setup-demo-team" disabled={!confirm || setup.isPending} onClick={() => setup.mutate()}>{setup.isPending ? (arabic ? "جارٍ الإعداد…" : "Setting up…") : (arabic ? "إعداد الفريق التجريبي" : "Set up demo team")}</button>
    </>}
    {(setup.isError || openWorker.isError) && <p className="form-notice" role="alert">{arabic ? "تعذر إكمال الطلب. حاول مرة أخرى. لم يتم الدفع." : "Could not complete the request. Please retry. No payment was made."}</p>}
  </section>;
}
