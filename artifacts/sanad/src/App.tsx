import { useEffect, useState, createContext, useContext, Children, cloneElement, isValidElement, type ReactNode, type FormEvent } from 'react';
import './sanad.css';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QRCodeSVG } from 'qrcode.react';
import { Route, Switch, Router as WouterRouter, Link, Redirect, useLocation, useRoute } from 'wouter';
import {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, Banknote, BarChart3, Bell, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Download, FileText, Globe2, Heart, LayoutDashboard, Menu,
  QrCode, Search, Settings, ShieldCheck, Sparkles, Star, Users, Wallet, X
} from 'lucide-react';
import {
  useGetPublicWorker, getGetPublicWorkerQueryKey, useCreateTipCheckout, useGetTipStatus,
  getGetTipStatusQueryKey, useGetWorkerDashboard, getGetWorkerDashboardQueryKey,
  useListWorkerTransactions, getListWorkerTransactionsQueryKey, useListWorkerPayouts,
  getListWorkerPayoutsQueryKey, useGetWorkerBadge, getGetWorkerBadgeQueryKey,
  useCreateCompanyProfile, useGetCompanyDashboard, getGetCompanyDashboardQueryKey,
  useListCompanyWorkers, getListCompanyWorkersQueryKey, useCreateCompanyWorker,
  useUpdateCompanyWorker, useListCompanyTransactions, getListCompanyTransactionsQueryKey,
  useListCompanyPayouts, getListCompanyPayoutsQueryKey, useCreateCompanyPayout,
  useUpdateCompanyPayoutStatus, useGetCompanyReport, getGetCompanyReportQueryKey
} from '@workspace/api-client-react';
import type { PayoutRecord, TipTransaction } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
const appearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#581C2B', colorForeground: '#3B1720', colorMutedForeground: '#745B56',
    colorDanger: '#A33232', colorBackground: '#FAF4EC', colorInput: '#FFFDF9',
    colorInputForeground: '#3B1720', colorNeutral: '#E8DAC8', fontFamily: 'Plus Jakarta Sans, Noto Sans Arabic, sans-serif', borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#FAF4EC] rounded-[24px] w-[440px] max-w-full overflow-hidden border border-[#E8DAC8]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#3B1720] font-bold', headerSubtitle: 'text-[#745B56]',
    socialButtonsBlockButtonText: 'text-[#3B1720] font-semibold', formFieldLabel: 'text-[#3B1720] font-semibold',
    footerActionLink: 'text-[#581C2B] font-bold', footerActionText: 'text-[#745B56]', dividerText: 'text-[#745B56]',
    identityPreviewEditButton: 'text-[#581C2B]', formFieldSuccessText: 'text-[#2E7D32]', alertText: 'text-[#3B1720]',
    logoBox: 'mb-2', logoImage: 'max-h-9', socialButtonsBlockButton: 'rounded-full border-[#E8DAC8]',
    formButtonPrimary: 'rounded-full bg-[#581C2B] hover:bg-[#3B1720] text-[#FAF4EC]',
    formFieldInput: 'rounded-xl border-[#E8DAC8] bg-[#FFFDF9] text-[#3B1720]',
    footerAction: 'text-[#745B56]', dividerLine: 'bg-[#E8DAC8]', alert: 'rounded-xl',
    otpCodeFieldInput: 'rounded-lg border-[#E8DAC8]', formFieldRow: 'gap-2', main: 'gap-5',
  },
};

type Language = 'en' | 'ar';
const LanguageContext = createContext<{ language: Language; toggle: () => void }>({ language: 'en', toggle: () => {} });
const useLanguage = () => useContext(LanguageContext);
const money = (fils = 0) => `KWD ${(fils / 1000).toFixed(3)}`;
const dateLabel = (value?: string, language: Language = 'en') => value ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW' : 'en-KW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const monthName = (value: string, language: Language = 'en') => {
  const d = new Date(`${value}-01T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW' : 'en', { month: 'short', year: 'numeric' }).format(d);
};
const kuwaitMonth = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value ?? '1970'}-${parts.find((part) => part.type === 'month')?.value ?? '01'}`;
};
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
function isHttpStatus(error: unknown, status: number) {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status?: unknown }).status === status;
}
function isHttp404(error: unknown) {
  return isHttpStatus(error, 404);
}
function baseAwareUrl(value: string) {
  const url = new URL(value, window.location.origin);
  if (basePath && url.origin === window.location.origin && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
    url.pathname = `${basePath}${url.pathname.startsWith('/') ? '' : '/'}${url.pathname}`;
  }
  return url.toString();
}

const arabicCopy: Record<string, string> = {
  'Overview':'نظرة عامة','Your overview':'نظرتك العامة','Company overview':'نظرة عامة للشركة','Transactions':'المعاملات',
  'Earnings & payouts':'الأرباح والمدفوعات','My QR badge':'رمز QR الخاص بي','Settings':'الإعدادات','Workers':'الموظفون',
  'Payouts':'المدفوعات','Reports':'التقارير','MANAGE YOUR TEAM':'إدارة فريقك','YOUR SANAD':'حسابك في سند',
  'Need a hand?':'هل تحتاج إلى مساعدة؟','We’re here to help.':'نحن هنا لمساعدتك.','Get in touch':'تواصل معنا',
  'Company manager':'مدير الشركة','Service team':'فريق الخدمة','A little recognition adds up':'التقدير يصنع فرقاً',
  'Good to see you,':'يسعدنا وجودك،','Your service is making a difference. Here’s how it’s adding up.':'خدمتك تصنع فرقاً. إليك ملخص تقدير الضيوف.',
  'Tips received':'الإكراميات المستلمة','This month':'هذا الشهر','Awaiting payout':'بانتظار التسجيل في الرواتب',
  'Guest rating':'تقييم الضيوف','All time':'الإجمالي','Since the 1st':'منذ بداية الشهر','Not yet in payroll':'لم تُسجل في الرواتب بعد',
  'From your guests':'من ضيوفك','Monthly overview':'ملخص شهري','A MOMENT TO NOTICE':'لحظة تستحق التقدير',
  'Your good work':'عملك الرائع','is being noticed.':'محل تقدير.','Every tip is a guest taking a moment to say your care mattered.':'كل إكرامية هي رسالة تقدير من ضيف لخدمتك.',
  'See all your tips':'عرض جميع الإكراميات','RECENT KINDNESS':'أحدث رسائل التقدير','Latest tips':'أحدث الإكراميات',
  'All transactions':'كل المعاملات','Every tip, in one place.':'كل الإكراميات في مكان واحد.','A record of every thank you':'سجل لكل رسالة شكر',
  'See what guests have sent your way and when.':'اطّلع على الإكراميات التي أرسلها الضيوف ووقتها.',
  'TIP HISTORY':'سجل الإكراميات','Export':'تصدير','No tips yet':'لا توجد إكراميات بعد',
  'Clear records, no guesswork':'سجلات واضحة بلا تخمين','Your earnings, accounted for.':'أرباحك موثقة بوضوح.',
  'Tips are tracked separately from payroll payouts.':'تُتابع الإكراميات بشكل منفصل عن سجلات الرواتب.',
  'Total tips':'إجمالي الإكراميات','Pending tips':'إكراميات معلقة','Paid in payroll':'مسجلة في الرواتب',
  'Awaiting payroll':'بانتظار الرواتب','Recorded payouts':'المدفوعات المسجلة','PAYROLL RECORD':'سجل الرواتب',
  'Payout history':'سجل المدفوعات','No payout records yet':'لا توجد سجلات مدفوعات بعد',
  'Your company’s payroll records will appear here.':'ستظهر سجلات الرواتب الخاصة بشركتك هنا.',
  'Make appreciation easy':'اجعل التقدير سهلاً','Your personal tip badge.':'رمز الإكرامية الشخصي.','Share this code with guests who want to thank you.':'شارك هذا الرمز مع الضيوف الراغبين في شكرك.',
  'Scan to leave a tip':'امسح لإرسال إكرامية','Powered by SANAD':'بدعم من سند','YOUR TIP LINK':'رابط الإكرامية الخاص بك',
  'One link. One easy thank you.':'رابط واحد، وشكر بسيط.','Guests can scan your QR or visit your personal link. They don’t need to create an account.':'يمكن للضيوف مسح الرمز أو زيارة رابطك. لا يحتاجون إلى إنشاء حساب.',
  'Copy':'نسخ','Your badge is linked to your worker account. Tips are recorded securely and can be reviewed anytime.':'رمزك مرتبط بحسابك الوظيفي. تُسجل الإكراميات بأمان ويمكنك مراجعتها في أي وقت.',
  'Print my badge':'اطبع رمزي','Your SANAD profile':'ملفك في سند','Your details, kept simple.':'بياناتك، بكل بساطة.',
  'Profile information is managed by your company.':'تدير شركتك معلومات ملفك.','Display name':'الاسم المعروض','Arabic name':'الاسم بالعربية',
  'Email address':'البريد الإلكتروني','Team / branch':'الفريق / الفرع',
  'Need to update something? Ask your company manager to change your profile details.':'هل ترغب بتحديث بياناتك؟ اطلب من مدير الشركة تعديل ملفك.',
  'Your team’s appreciation, at a glance':'تقدير فريقك، في لمحة','Good afternoon,':'مساء الخير،',
  'Team tip activity':'نشاط إكراميات الفريق','SANAD payout record':'سجل دفعة سند',
  'Here’s the latest from the people making your service memorable.':'إليك أحدث ما يقدمه فريقك الذي يجعل الخدمة مميزة.',
  'Across your team':'على مستوى الفريق','All team tips':'إكراميات الفريق','Pending payroll':'معلّق للرواتب',
  'Ready to record':'جاهز للتسجيل','Active workers':'الموظفون النشطون','On your team':'ضمن فريقك',
  'YOUR PEOPLE':'أفراد فريقك','Team at a glance':'الفريق في لمحة','View all':'عرض الكل','LATEST ACTIVITY':'أحدث النشاط',
  'Recent tips':'أحدث الإكراميات','A transparent record for your team':'سجل واضح لفريقك','Every tip, clearly tracked.':'كل إكرامية موثقة بوضوح.',
  'Review tips received across your company.':'راجع الإكراميات المستلمة عبر شركتك.','ALL TEAM TIPS':'كل إكراميات الفريق',
  'Search workers':'ابحث عن موظف','Tip records meet payroll':'الإكراميات وسجلات الرواتب','Keep payouts easy to follow.':'تابع المدفوعات بسهولة.',
  'Record a payout against a worker and payroll month. This creates a record only.':'سجل دفعة لموظف وشهر الرواتب. هذا الإجراء ينشئ سجلاً فقط.',
  'Record a payout':'تسجيل دفعة','Marking a record paid means your employer recorded it in payroll. SANAD does not initiate or verify a bank transfer.':'تعني حالة «مدفوع» أن صاحب العمل سجّلها ضمن الرواتب. لا يبدأ سند تحويلاً بنكياً ولا يتحقق منه.',
  'PAYROLL RECORDS':'سجلات الرواتب','Update record':'تحديث السجل','Payroll period':'فترة الرواتب','Recorded':'تاريخ التسجيل',
  'Guest / transaction':'الضيف / المعاملة','Received':'تاريخ الاستلام','Rating':'التقييم','Action':'الإجراء',
  'Amount':'المبلغ','Status':'الحالة','Saving…':'جارٍ الحفظ…','Mark pending':'تحديد كمعلّق','Mark paid':'تحديد كمدفوع',
  'This records a payment already handled through your payroll process.':'يسجل هذا دفعة تمت معالجتها مسبقاً ضمن الرواتب.',
  'Worker':'الموظف','Select a worker':'اختر موظفاً','Amount in KWD':'المبلغ بالدينار الكويتي','Payroll month':'شهر الرواتب',
  'Note (optional)':'ملاحظة (اختيارية)','Optional reference for this payroll record':'مرجع اختياري لسجل الرواتب',
  'Save payout record':'حفظ سجل الدفعة','Saving record…':'جارٍ حفظ السجل…','Could not save payout. Please try again.':'تعذر حفظ الدفعة. يرجى المحاولة مجدداً.',
  'A clearer view, month by month':'رؤية أوضح، شهراً بعد شهر','Your monthly picture.':'ملخصك الشهري.','Tip activity and payroll records, together.':'نشاط الإكراميات وسجلات الرواتب معاً.',
  'REPORTING PERIOD':'الفترة','SANAD MONTHLY REPORT':'تقرير سند الشهري','Total tips received':'إجمالي الإكراميات المستلمة',
  'Paid out and recorded':'مدفوع ومسجل','Team members with activity':'أفراد الفريق النشطون',
  'Individual tip transactions':'معاملات الإكراميات','Download report':'تنزيل التقرير',
  'The details behind your team':'بيانات شركتك وفريقك','Company information.':'بيانات الشركة.','Keep your company contact details accurate.':'حافظ على دقة بيانات التواصل الخاصة بشركتك.',
  'COMPANY PROFILE':'ملف الشركة','Your company details':'بيانات شركتك','Company name':'اسم الشركة',
  'Commercial registration number':'رقم السجل التجاري','Contact email':'البريد الإلكتروني للتواصل',
  'Your team’s records are private to your company account.':'سجلات فريقك خاصة بحساب شركتك.',
  'Save company details':'حفظ بيانات الشركة','Company details saved.':'تم حفظ بيانات الشركة.','We couldn’t save the profile. Please try again.':'تعذر حفظ الملف. يرجى المحاولة مجدداً.',
  'Set up your company':'إعداد شركتك','A GOOD PLACE TO BEGIN':'بداية موفقة','Let’s set up':'لنبدأ بإعداد',
  'your company.':'شركتك.','Once your company details are in, you can invite your team, give every worker a SANAD QR badge, and see appreciation add up.':'بعد إدخال بيانات شركتك، يمكنك دعوة فريقك ومنح كل موظف رمز سند ومتابعة التقدير.',
  'Company-wide tip records':'سجلات إكراميات الشركة','Personal QR badges for workers':'رموز QR شخصية للموظفين',
  'Clear payroll history':'سجل رواتب واضح','Tell us about your business':'أخبرنا عن نشاطك التجاري',
  'This creates your company workspace. You can update these details later.':'ينشئ هذا مساحة عمل شركتك. يمكنك تحديث هذه البيانات لاحقاً.',
  'e.g. Marina House':'مثال: دار مارينا','Optional':'اختياري','We couldn’t set up your company. Please check your details and try again.':'تعذر إعداد شركتك. تحقق من البيانات وحاول مجدداً.',
  'Setting up your workspace…':'جارٍ إعداد مساحة العمل…','Create company workspace':'إنشاء مساحة عمل الشركة',
  'Your company details stay within your workspace.':'تبقى بيانات شركتك ضمن مساحة العمل الخاصة بك.',
  'GROW YOUR TEAM':'وسّع فريقك','Add a worker':'إضافة موظف','We’ll create their SANAD profile and personal QR link.':'سننشئ ملفه في سند ورمز QR الشخصي.',
  'Full name':'الاسم الكامل','Role':'المسمى الوظيفي','Branch':'الفرع','e.g. Faisal Al-Rashid':'مثال: فيصل الراشد',
  'No email added':'لم يضف بريداً إلكترونياً','No branch':'لا يوجد فرع','Pause':'إيقاف مؤقت','Activate':'تفعيل',
  'Barista':'باريستا','Salmiya':'السالمية',
  'No team members found':'لم يتم العثور على أعضاء الفريق','Try another name or add your first worker.':'جرّب اسماً آخر أو أضف أول موظف.',
  'Adding worker…':'جارٍ إضافة الموظف…','Could not add this worker. Please check the details.':'تعذرت إضافة الموظف. تحقق من البيانات.',
  'Find a worker':'ابحث عن موظف','TEAM DIRECTORY':'دليل الفريق',
  'Pending':'معلّق','Paid':'مدفوع','Complete':'مكتمل','Demo':'تجريبي','Failed':'فشل','Cancelled':'ملغي',
  'Invited':'مدعو','Active':'نشط','Inactive':'غير نشط',
  'Nothing to show yet.':'لا توجد بيانات للعرض حالياً.',
  'We couldn’t load this just now':'تعذر تحميل البيانات الآن','Your records are safe. Please try again.':'سجلاتك محفوظة. يرجى المحاولة مجدداً.',
  'Try again':'حاول مجدداً','WORKER':'الموظف','COMPANY':'الشركة',
  'A good moment':'لحظة جميلة','deserves a':'تستحق','thank you.':'شكراً.',
  'A little appreciation goes a long way':'للتقدير البسيط أثر كبير','Send a thank you':'أرسل رسالة شكر',
  'See how it works':'اكتشف كيف يعمل','Private by design':'خصوصيتك أولاً','No account needed to tip':'لا تحتاج إلى حساب لإرسال إكرامية',
  'Scan a personal QR code':'امسح رمز QR الشخصي','Choose what feels right':'اختر ما يناسبك','Send thanks in seconds':'أرسل شكرك خلال ثوانٍ',
  'Secure, simple, discreet':'آمن وبسيط ويحفظ الخصوصية','A small gesture, made simple':'لفتة بسيطة، بطريقة سهلة',
  'Good service is':'الخدمة الجيدة','worth remembering.':'تستحق التقدير.','One scan is all it takes to send a little appreciation directly to the person who earned it.':'امسح الرمز لإرسال تقديرك مباشرةً إلى الشخص الذي يستحقه.',
  'Scan their code':'امسح رمزهم','Look for a SANAD QR badge at the counter, on a table, or in a welcome card.':'ابحث عن رمز سند على المنضدة أو الطاولة أو بطاقة الترحيب.',
  'Choose an amount':'اختر مبلغاً','Pick a thoughtful amount and add a rating if you’d like. No account required.':'اختر المبلغ المناسب وأضف تقييماً إن رغبت. لا تحتاج إلى حساب.',
  'That’s your thank you':'هكذا ترسل شكرك','Pay securely and get a clear confirmation. Your tip goes to the person who helped.':'ادفع بأمان واحصل على تأكيد واضح. تصل الإكرامية إلى الشخص الذي خدمك.',
  'Make appreciation part of':'اجعل التقدير جزءاً من','the culture.':'ثقافة فريقك.','For the people behind the experience':'للأشخاص الذين يصنعون التجربة',
  'Give your team a more transparent way to receive tips and your managers a clearer view of what’s happening.':'امنح فريقك طريقة أوضح لاستلام الإكراميات، ومديريك رؤية أفضل لما يحدث.',
  'Personal QR badges for every worker':'رموز QR شخصية لكل موظف','Clear tip and payout records':'سجلات واضحة للإكراميات والمدفوعات',
  'Bring SANAD to your team':'انضم بفريقك إلى سند','A thank you takes a moment':'الشكر لا يستغرق سوى لحظة',
  'Make someone’s':'اجعل يوم أحدهم','day a little brighter.':'أكثر إشراقاً.','No sign-up. No awkward moment. Just appreciation.':'لا حاجة للتسجيل أو الإحراج، فقط تقدير.',
  'Made with care in Kuwait.':'صُنع بعناية في الكويت.','Worker sign in':'دخول الموظفين','For companies':'للشركات',
  'Or enter another amount':'أو أدخل مبلغاً آخر','How was your experience?':'كيف كانت تجربتك؟',
  'Optional, but always appreciated.':'اختياري، لكننا نقدر رأيك.','Secure checkout. Your details stay private.':'دفع آمن. بياناتك تبقى خاصة.',
  'Card payments are processed by Stripe and settle to SANAD’s connected account. Employer payouts are recorded separately.':'تُعالج مدفوعات البطاقات عبر Stripe وتصل إلى حساب سند المتصل. وتسجل مدفوعات صاحب العمل بشكل منفصل.',
  'Stripe test mode. No real payment will be charged in this workspace.':'وضع اختبار Stripe. لن يتم تحصيل أي مبلغ حقيقي في مساحة العمل هذه.',
  'Stripe is not enabled for live payments yet. No payment was made.':'لم يتم تفعيل مدفوعات Stripe الحقيقية بعد. لم يتم تحصيل أي مبلغ.',
  'Checkout was cancelled. No payment was confirmed.':'تم إلغاء الدفع. لم يتم تأكيد أي عملية دفع.',
  'Continue with':'المتابعة بمبلغ','Preparing secure checkout…':'جارٍ تجهيز الدفع الآمن…',
  'Demo mode — no real payment will be charged.':'وضع تجريبي — لن يتم تحصيل أي مبلغ.','You don’t need an account to send a tip.':'لا تحتاج إلى حساب لإرسال إكرامية.',
  'Leave a little thank you':'اترك رسالة شكر بسيطة','Your details stay private.':'بياناتك تبقى خاصة.',
  'Your thank you is on its way.':'إكراميتك في طريقها.','A demo tip is ready.':'الإكرامية التجريبية جاهزة.',
  'This payment didn’t go through.':'لم تتم عملية الدفع.','Checkout was cancelled.':'تم إلغاء الدفع.',
  'Checking your tip…':'جارٍ التحقق من الإكرامية…','This is a demonstration only. No payment was made or charged.':'هذا عرض تجريبي فقط. لم يتم إجراء أي دفع أو تحصيل أي مبلغ.',
  'Your appreciation has been received. Thank you for making someone’s day.':'وصل تقديرك. شكراً لمساهمتك في إسعاد أحدهم.',
  'We’re waiting for a confirmed payment status. This page will update automatically.':'بانتظار تأكيد حالة الدفع. ستتحدث هذه الصفحة تلقائياً.',
  'No charge was confirmed. You can safely try again.':'لم يتم تأكيد أي خصم. يمكنك المحاولة مجدداً بأمان.',
  'TIP STATUS':'حالة الإكرامية','THANK YOU SENT':'تم إرسال الشكر','DEVELOPMENT DEMO':'عرض تجريبي للتطوير',
  'Recipient':'المستلم','Back to SANAD':'العودة إلى سند','Return to SANAD':'العودة إلى سند',
  'We couldn’t verify the payment status.':'تعذر التحقق من حالة الدفع.','Check again':'تحقق مجدداً',
};
function localized(text: string, language: Language) {
  if (language !== 'ar') return text;
  const trimmed = text.trim();
  const translated = arabicCopy[trimmed];
  return translated ? text.replace(trimmed, translated) : text;
}
function LocalizedTree({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  if (language !== 'ar') return <>{children}</>;
  return <>{Children.map(children, (child) => {
    if (typeof child === 'string') return localized(child, language);
    if (!isValidElement<{ children?: ReactNode; placeholder?: string; title?: string; 'aria-label'?: string }>(child)) return child;
    const props = child.props;
    const translatedProps = {
      placeholder: props.placeholder ? localized(props.placeholder, language) : undefined,
      title: props.title ? localized(props.title, language) : undefined,
      'aria-label': props['aria-label'] ? localized(props['aria-label'], language) : undefined,
    };
    return props.children == null
      ? cloneElement(child, translatedProps)
      : cloneElement(child, translatedProps, <LocalizedTree>{props.children}</LocalizedTree>);
  })}</>;
}

function LanguageToggle() {
  const { language, toggle } = useLanguage();
  return <button data-testid="button-language" className="language-toggle" onClick={toggle} aria-label="Switch language"><Globe2 size={15}/><span>{language === 'en' ? 'العربية' : 'English'}</span></button>;
}
function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} data-testid="link-brand"><span className="brand-mark">س</span><span>SANAD<span className="brand-dot">.</span></span></Link>;
}
function DemoFlag({ demo }: { demo?: boolean }) {
  const { language } = useLanguage();
  return demo ? <span className="demo-flag"><Sparkles size={12}/> {language==='ar'?'بيانات تجريبية':'DEMO DATA'}</span> : null;
}
function Avatar({ name, photo, size = 'md' }: { name: string; photo?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  return photo ? <img className={`avatar avatar-${size}`} src={photo} alt={name}/> : <span className={`avatar avatar-${size}`} aria-label={name}>{initials(name)}</span>;
}
function PillButton({ children, onClick, className = '', type = 'button', disabled }: { children: ReactNode; onClick?: () => void; className?: string; type?: 'button' | 'submit'; disabled?: boolean }) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`pill-button ${className}`}>{children}</button>;
}
function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="skeleton-stack" aria-label="Loading"><div className="skeleton wide"/>{Array.from({ length: rows }).map((_, i) => <div className="skeleton" key={i}/>)}</div>;
}
function ErrorPanel({ retry }: { retry: () => void }) {
  const { language } = useLanguage();
  return <div className="empty-panel"><CircleHelp size={26}/><strong>{localized('We couldn’t load this just now',language)}</strong><span>{localized('Your records are safe. Please try again.',language)}</span><PillButton onClick={retry}>{localized('Try again',language)}</PillButton></div>;
}
function EmptyPanel({ title, text }: { title: string; text: string }) {
  const { language } = useLanguage();
  return <div className="empty-panel"><div className="empty-icon"><Sparkles size={21}/></div><strong>{localized(title,language)}</strong><span>{localized(text,language)}</span></div>;
}
function Badge({ status }: { status: string }) {
  const { language } = useLanguage();
  const label = localized(status === 'succeeded' ? 'Complete' : status === 'paid' ? 'Paid' : status === 'pending' ? 'Pending' : status === 'demo' ? 'Demo' : status.charAt(0).toUpperCase() + status.slice(1), language);
  return <span className={`status status-${status}`}>{status === 'succeeded' || status === 'paid' ? <Check size={12}/> : <Clock3 size={12}/>} {label}</span>;
}
function Metric({ label, value, caption, icon: Icon, accent = false }: { label: string; value: string; caption?: string; icon: typeof Wallet; accent?: boolean }) {
  const { language } = useLanguage();
  return <section className={`metric-card ${accent ? 'metric-accent' : ''}`}><div className="metric-top"><span>{localized(label,language)}</span><span className="metric-icon"><Icon size={18}/></span></div><strong>{value}</strong>{caption && <small>{localized(caption,language)}</small>}</section>;
}
function Header() {
  const { language } = useLanguage();
  return <header className="site-header"><Brand/><nav className="public-nav"><a href="#how-it-works">{language === 'ar' ? 'كيف يعمل' : 'How it works'}</a><a href="#for-business">{language === 'ar' ? 'للشركات' : 'For business'}</a><Link href="/sign-in">{language === 'ar' ? 'تسجيل الدخول' : 'Sign in'}</Link></nav><div className="header-actions"><LanguageToggle/><Link className="header-signup" href="/sign-up">{language === 'ar' ? 'ابدأ الآن' : 'Get started'} <ArrowUpRight size={15}/></Link></div></header>;
}
function Landing() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  return <LocalizedTree><main className="landing">
    <Header/>
    <section className="hero-wrap">
      <div className="hero-copy rise"><div className="eyebrow"><span className="eyebrow-dot"/> A little appreciation goes a long way</div>
        <h1>{ar ? <>شكراً،<br/><em>بطريقة أسهل.</em></> : <>A good moment<br/>deserves a <em>thank you.</em></>}</h1>
        <p>{ar ? 'ساند طريقة بسيطة وآمنة لتقدير الأشخاص الذين يجعلون يومك أفضل.' : 'SANAD makes it simple to show appreciation to the people who make your day better.'}</p>
        <div className="hero-actions"><Link href="/tip/ahmed-almutairi" className="cta-primary">Send a thank you <ArrowUpRight size={17}/></Link><a href="#how-it-works" className="cta-quiet">See how it works <ChevronRight size={16}/></a></div>
        <div className="trust-note"><ShieldCheck size={16}/><span>Private by design <i/> No account needed to tip</span></div>
      </div>
      <div className="hero-art rise">
        <div className="art-sun"/><div className="hero-arch"><img src="/worker-portrait.png" alt="A SANAD hospitality worker"/></div>
        <div className="floating-note"><span className="note-heart"><Heart size={15} fill="currentColor"/></span><div><strong>Thoughtful service</strong><small>deserves to be noticed</small></div></div>
        <div className="hero-caption"><span>Everyday kindness, returned.</span><span>01 — 03</span></div>
        <div className="sadu art-pattern"/>
      </div>
      <div className="hero-vertical">A MORE HUMAN WAY TO TIP · KUWAIT</div>
    </section>
    <section className="proof-strip"><div><span className="proof-number">01</span><span>Scan a personal QR code</span></div><div><span className="proof-number">02</span><span>Choose what feels right</span></div><div><span className="proof-number">03</span><span>Send thanks in seconds</span></div><div className="proof-last"><ShieldCheck size={18}/><span>Secure, simple, discreet</span></div></section>
    <section id="how-it-works" className="story-section">
      <div className="section-intro"><div className="eyebrow">A small gesture, made simple</div><h2>Good service is<br/><em>worth remembering.</em></h2><p>One scan is all it takes to send a little appreciation directly to the person who earned it.</p></div>
      <div className="steps-grid"><article className="step-card"><span className="step-index">01 / FIND</span><div className="step-visual scan-visual"><QrGraphic/><span className="scan-target"/></div><h3>Scan their code</h3><p>Look for a SANAD QR badge at the counter, on a table, or in a welcome card.</p></article><article className="step-card"><span className="step-index">02 / CHOOSE</span><div className="step-visual amount-visual"><span className="amount-chip">1.000 KWD</span><span className="amount-chip selected">2.000 KWD</span><span className="amount-chip">Your amount</span></div><h3>Choose an amount</h3><p>Pick a thoughtful amount and add a rating if you’d like. No account required.</p></article><article className="step-card"><span className="step-index">03 / SEND</span><div className="step-visual send-visual"><div className="send-seal"><Check size={24}/></div><div className="send-lines"><b>Thank you, Ahmed</b><span>Your appreciation is on its way.</span></div></div><h3>That’s your thank you</h3><p>Pay securely and get a clear confirmation. Your tip goes to the person who helped.</p></article></div>
    </section>
    <section className="quote-band"><div className="quote-mark">“</div><blockquote>A great experience is never just one thing.<br/>It’s the person who made it feel easy.</blockquote><span>THE SANAD PROMISE</span></section>
    <section id="for-business" className="business-section"><div className="business-copy"><div className="eyebrow">For the people behind the experience</div><h2>Make appreciation<br/>part of <em>the culture.</em></h2><p>Give your team a more transparent way to receive tips and your managers a clearer view of what’s happening.</p><ul><li><BadgeCheck/>Personal QR badges for every worker</li><li><BadgeCheck/>Clear tip and payout records</li><li><BadgeCheck/>One calm place for your team to manage it all</li></ul><Link href="/sign-up" className="business-link">Bring SANAD to your team <ArrowUpRight size={16}/></Link></div><div className="business-panel"><div className="panel-topline"><span>YOUR TEAM, IN GOOD HANDS</span><span className="panel-dot"/></div><div className="business-stat"><span>This month</span><strong>KWD 1,284.750</strong><small><ArrowUpRight size={14}/> 12.4% from last month</small></div><div className="mini-bars">{[28,42,34,56,38,67,51,74,61,89,69,96].map((n,i)=><span key={i} style={{height:`${n}%`}} className={i===11?'bar-highlight':''}/>)}</div><div className="business-people"><div className="people-stack"><Avatar name="Rana" size="sm"/><Avatar name="Sami" size="sm"/><Avatar name="Noor" size="sm"/></div><span>12 team members earning recognition</span><ChevronRight size={15}/></div><div className="sadu panel-pattern"/></div></section>
    <section className="last-call"><div className="last-orbit"/><div className="eyebrow">A thank you takes a moment</div><h2>Make someone’s<br/><em>day a little brighter.</em></h2><Link href="/tip/ahmed-almutairi" className="cta-primary">Send a thank you <ArrowUpRight size={17}/></Link><span>No sign-up. No awkward moment. Just appreciation.</span></section>
    <Footer/>
  </main></LocalizedTree>;
}
function Footer() { return <footer className="footer"><Brand/><span>Made with care in Kuwait.</span><div><Link href="/sign-in">Worker sign in</Link><Link href="/sign-up">For companies</Link><span>© SANAD 2025</span></div></footer>; }
function QrGraphic() {
  return <div className="qr-graphic" aria-label="Decorative QR pattern"><div className="qr-corner"/><div className="qr-corner"/><div className="qr-corner"/>{Array.from({length:25}).map((_,i)=><i key={i} className={((i*7+3)%5===0 || (i*13)%7<2)?'qr-dark':''}/>)}</div>;
}

function TipPage() {
  const [, params] = useRoute('/tip/:slug');
  const slug = params?.slug ?? '';
  const { data: worker, isLoading, isError, refetch } = useGetPublicWorker(slug, { query: { enabled: !!slug, queryKey: getGetPublicWorkerQueryKey(slug) } });
  const checkout = useCreateTipCheckout();
  const [amount, setAmount] = useState(2000);
  const [custom, setCustom] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [notice, setNotice] = useState(() => new URLSearchParams(window.location.search).get('checkout') === 'cancelled' ? 'Checkout was cancelled. No payment was confirmed.' : '');
  const [, setLocation] = useLocation();
  const amountFils = custom ? Math.round(Number(custom) * 1000) : amount;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setNotice('');
    if (!Number.isFinite(amountFils) || amountFils < 250) { setNotice('Please enter at least KWD 0.250.'); return; }
    checkout.mutate({ data: { workerSlug: slug, amountFils, rating } }, {
      onSuccess: (result) => {
        sessionStorage.setItem('sanad-tip-id', result.tipId);
        sessionStorage.setItem('sanad-tip-mode', result.paymentMode);
        sessionStorage.setItem('sanad-tip-worker', worker?.name ?? '');
        if (result.paymentMode === 'stripe' && result.checkoutUrl) window.location.assign(result.checkoutUrl);
        else setLocation(`/tip-confirmation?tipId=${encodeURIComponent(result.tipId)}`);
      },
      onError: (error) => setNotice(isHttpStatus(error, 503) ? 'Stripe is not enabled for live payments yet. No payment was made.' : isHttpStatus(error, 502) ? 'Stripe checkout is unavailable. No payment was made.' : 'We couldn’t start checkout. Please try again in a moment.'),
    });
  };
  return <LocalizedTree><main className="tip-page"><div className="tip-top"><Brand/><LanguageToggle/></div><div className="tip-card rise">
    {isLoading ? <Skeleton rows={4}/> : isError || !worker ? <ErrorPanel retry={() => { void refetch(); }}/> : <>
      <div className="tip-profile"><Avatar name={worker.name} photo={worker.photoUrl} size="lg"/><span className="tip-brandline">{worker.companyName}</span><h1>{worker.name}</h1>{worker.arabicName && <span className="arabic tip-arabic" dir="rtl">{worker.arabicName}</span>}<p>{worker.role}{worker.branch ? ` · ${worker.branch}` : ''}</p><span className="tip-thanks"><Heart size={13}/> Leave a little thank you</span></div>
      <form onSubmit={submit} className="tip-form">
        <label className="form-label">Choose an amount <small>KWD</small></label>
        <div className="amount-options">{[250,500,1000,2000].map((n)=><button data-testid={`button-amount-${n}`} type="button" onClick={()=>{setAmount(n);setCustom('')}} className={`amount-option ${!custom&&amount===n?'chosen':''}`} key={n}>KWD {(n/1000).toFixed(3)}</button>)}</div>
        <label className="custom-amount"><span>Or enter another amount</span><div><span>KWD</span><input data-testid="input-custom-amount" type="number" min="0.250" max="1000" step="0.001" placeholder="0.000" value={custom} onChange={(e)=>setCustom(e.target.value)}/></div></label>
        <div className="rating-row"><div><strong>How was your experience?</strong><span>Optional, but always appreciated.</span></div><div className="rating-stars">{[1,2,3,4,5].map((n)=><button data-testid={`button-rating-${n}`} aria-label={`${n} stars`} aria-pressed={n<= (rating ?? 0)} type="button" onClick={()=>setRating(rating===n?null:n)} key={n}><Star size={20} fill={n<=(rating ?? 0)?'currentColor':'none'}/></button>)}</div></div>
        <div className="secure-tip"><ShieldCheck size={16}/><span>Card payments are processed by Stripe and settle to SANAD’s connected account. Employer payouts are recorded separately.</span></div>
        {import.meta.env.DEV && <div className="demo-callout">Stripe test mode. No real payment will be charged in this workspace.</div>}
        {notice && <div className="form-notice" role="alert">{notice}</div>}
        <PillButton type="submit" className="submit-tip" disabled={checkout.isPending}>{checkout.isPending ? 'Opening Stripe checkout…' : <>Continue with {money(amountFils)} <ArrowUpRight size={17}/></>}</PillButton>
      </form>
      <div className="guest-footnote"><ShieldCheck size={13}/> You don’t need an account to send a tip.</div>
    </>}
  </div><p className="tip-powered">A thoughtful little gesture, powered by <b>SANAD</b></p></main></LocalizedTree>;
}
function ConfirmationPage() {
  const params = new URLSearchParams(window.location.search);
  const tipId = params.get('tipId') || sessionStorage.getItem('sanad-tip-id') || '';
  const demoMode = sessionStorage.getItem('sanad-tip-mode') === 'demo';
  const { data: status, isLoading, isError, refetch } = useGetTipStatus(tipId, { query: { enabled: !!tipId, queryKey: getGetTipStatusQueryKey(tipId), refetchInterval: (query) => query.state.data?.status === 'pending' ? 3000 : false } });
  const state = status?.status || (demoMode ? 'demo' : 'pending');
  const title = state === 'succeeded' ? 'Your thank you is on its way.' : state === 'demo' ? 'A demo tip is ready.' : state === 'failed' ? 'This payment didn’t go through.' : state === 'cancelled' ? 'Checkout was cancelled.' : 'Checking your tip…';
  const copy = state === 'demo' ? 'This is a demonstration only. No payment was made or charged.' : state === 'succeeded' ? 'Your appreciation has been received. Thank you for making someone’s day.' : state === 'pending' ? 'We’re waiting for a confirmed payment status. This page will update automatically.' : 'No charge was confirmed. You can safely try again.';
  return <LocalizedTree><main className="tip-page"><div className="tip-top"><Brand/><LanguageToggle/></div><section className="outcome-card rise"><div className={`outcome-symbol outcome-${state}`}>{state === 'succeeded' ? <Check size={29}/> : state === 'demo' ? <Sparkles size={27}/> : state === 'failed' ? <X size={27}/> : <Clock3 size={27}/>}</div><span className="eyebrow">{state === 'succeeded' ? 'THANK YOU SENT' : state === 'demo' ? 'DEVELOPMENT DEMO' : 'TIP STATUS'}</span><h1>{title}</h1><p>{copy}</p>{isLoading && !demoMode && <div className="loading-line"/>}{isError && <div className="form-notice">We couldn’t verify the payment status. <button onClick={()=>void refetch()}>Check again</button></div>}{status && <div className="outcome-details"><span>Recipient</span><strong>{status.workerName || sessionStorage.getItem('sanad-tip-worker') || 'SANAD worker'}</strong><span>Amount</span><strong>{money(status.amountFils)}</strong></div>}{status?.isDemo && <div className="demo-callout">DEMO — this status does not represent a real charge.</div>}<Link href="/" className="cta-primary centered">{state === 'failed' || state === 'cancelled' ? 'Return to SANAD' : 'Back to SANAD'} <ArrowUpRight size={17}/></Link></section><p className="tip-powered">A thoughtful little gesture, powered by <b>SANAD</b></p></main></LocalizedTree>;
}

const workerNav = [
  { href:'/worker', label:'Overview', icon:LayoutDashboard }, { href:'/worker/transactions',label:'Transactions',icon:ArrowDownLeft },
  { href:'/worker/earnings',label:'Earnings & payouts',icon:Wallet }, { href:'/worker/qr',label:'My QR badge',icon:QrCode }, { href:'/worker/settings',label:'Settings',icon:Settings },
];
const companyNav = [
  { href:'/company',label:'Overview',icon:LayoutDashboard },{ href:'/company/workers',label:'Workers',icon:Users },
  { href:'/company/transactions',label:'Transactions',icon:ArrowDownLeft },{ href:'/company/payouts',label:'Payouts',icon:Banknote },
  { href:'/company/reports',label:'Reports',icon:BarChart3 },{ href:'/company/settings',label:'Settings',icon:Settings },
];
function PortalLayout({ children, company = false, title = 'Overview' }: { children: ReactNode; company?: boolean; title?: string }) {
  const { language } = useLanguage();
  const [currentLocation] = useLocation();
  const workerAccount = useGetWorkerDashboard({ query: { enabled: !company, queryKey: getGetWorkerDashboardQueryKey() } });
  const companyAccount = useGetCompanyDashboard({ query: { enabled: company, queryKey: getGetCompanyDashboardQueryKey() } });
  const nav = company ? companyNav : workerNav;
  const [mobileNav,setMobileNav] = useState(false);
  const currentPath = basePath && currentLocation.startsWith(basePath) ? currentLocation.slice(basePath.length) || '/' : currentLocation;
  const accountName = company ? companyAccount.data?.company.name || 'Your company' : workerAccount.data?.worker.name || 'Your account';
  const accountRole = company ? 'Company manager' : workerAccount.data?.worker.role || 'Worker';
  return <LocalizedTree><div className="portal">
    <aside className={`portal-sidebar ${mobileNav?'sidebar-open':''}`}><div className="side-brand"><Brand/><button className="mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="side-profile"><Avatar name={accountName} size="md"/><div><strong>{accountName}</strong><span>{accountRole}</span></div><ChevronDown size={15}/></div>
      <span className="side-section">{company?'MANAGE YOUR TEAM':'YOUR SANAD'}</span><nav className="side-nav">{nav.map((item)=>{const active=currentPath===item.href;const Icon=item.icon;return <Link href={item.href} key={item.href} onClick={()=>setMobileNav(false)} className={`side-link ${active?'active':''}`} data-testid={`link-nav-${item.href.split('/').pop()}`}><Icon size={17}/><span>{item.label}</span></Link>})}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><div className="help-icon"><CircleHelp size={17}/></div><strong>Need a hand?</strong><span>We’re here to help.</span><a href="mailto:hello@sanad.kw">Get in touch <ArrowUpRight size={12}/></a></div><span className="side-version">SANAD · KUWAIT</span></div>
    </aside>
    {mobileNav && <button aria-label="Close navigation" className="nav-backdrop" onClick={()=>setMobileNav(false)}/>}
    <div className="portal-main"><header className="portal-header"><button className="mobile-menu" onClick={()=>setMobileNav(true)} aria-label="Open menu"><Menu/></button><div><span className="breadcrumb">SANAD <ChevronRight size={12}/> {company?'COMPANY':'WORKER'}</span><h1>{localized(title,language)}</h1></div><div className="portal-header-tools"><LanguageToggle/><button className="icon-button" aria-label="Notifications"><Bell size={17}/><i/></button><div className="top-user">{initials(accountName)}</div></div></header>
      <main className="portal-content">{children}</main>
    </div>
  </div></LocalizedTree>;
}
function QueryState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <Skeleton rows={5}/>;
  if (error) return <ErrorPanel retry={retry}/>;
  return <>{children}</>;
}
function TrendChart({ values, label = 'Tip activity' }: { values: { month: string; amountFils: number }[]; label?: string }) {
  const { language } = useLanguage();
  const list = values ?? [];
  if (!list.length) return <EmptyPanel title="Your story starts here" text="Monthly activity will appear here as tips come in." />;
  const max = Math.max(...list.map((x)=>x.amountFils),1);
  return <LocalizedTree><div className="chart-wrap"><div className="chart-heading"><div><span className="panel-kicker">{label}</span><strong>Monthly overview</strong></div><button className="period-select">Last 6 months <ChevronDown size={14}/></button></div><div className="chart-bars">{list.slice(-6).map((item,i)=><div className="chart-col" key={`${item.month}-${i}`}><span className="chart-value">{money(item.amountFils)}</span><div className="chart-track"><i style={{height:`${Math.max(item.amountFils/max*100,5)}%`}} className={i===list.slice(-6).length-1?'bar-current':''}/></div><span className="chart-month">{monthName(item.month,language).split(' ')[0]}</span></div>)}</div></div></LocalizedTree>;
}
function TransactionTable({ transactions, empty = 'Nothing to show yet.' }: { transactions?: TipTransaction[]; empty?: string }) {
  const { language } = useLanguage();
  if (!transactions?.length) return <EmptyPanel title="No tips yet" text={empty}/>;
  return <LocalizedTree><div className="table-scroll"><table className="data-table"><thead><tr><th>Guest / transaction</th><th>Received</th><th>Rating</th><th>Status</th></tr></thead><tbody>{transactions.map((tx)=> <tr key={tx.id} data-testid={`row-transaction-${tx.id}`}><td><div className="table-person"><span className="transaction-avatar"><Heart size={14}/></span><span><b>{tx.workerName}</b><small>{dateLabel(tx.createdAt,language)}{tx.isDemo?' · Demo':''}</small></span></div></td><td className="table-amount">{money(tx.amountFils)}</td><td>{tx.rating ? <span className="rating-tag"><Star size={12} fill="currentColor"/> {tx.rating}.0</span> : '—'}</td><td><Badge status={tx.isDemo?'demo':tx.status}/></td></tr>)}</tbody></table></div></LocalizedTree>;
}
function WorkerOverview() {
  const q = useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  const d=q.data;
  return <PortalLayout title="Your overview"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{d&&<><div className="welcome-row"><div><div className="eyebrow">A little recognition adds up</div><h2>Good to see you, {d.worker.name.split(' ')[0]}.</h2><p>Your service is making a difference. Here’s how it’s adding up.</p></div><DemoFlag demo={d.isDemo}/></div><div className="metric-grid"><Metric label="Tips received" value={money(d.totalTipsFils)} caption="All time" icon={Wallet} accent/><Metric label="This month" value={money(d.monthTipsFils)} caption="Since the 1st" icon={ArrowUpRight}/><Metric label="Awaiting payout" value={money(d.pendingTipsFils)} caption="Not yet in payroll" icon={Clock3}/><Metric label="Guest rating" value={d.averageRating ? `${d.averageRating.toFixed(1)} / 5`:'—'} caption="From your guests" icon={Star}/></div><div className="portal-columns"><section className="surface chart-surface"><TrendChart values={d.monthly}/></section><section className="surface insight-card"><div className="panel-kicker">A MOMENT TO NOTICE</div><div className="insight-heart"><Heart size={20} fill="currentColor"/></div><h3>Your good work<br/>is being noticed.</h3><p>Every tip is a guest taking a moment to say your care mattered.</p><Link href="/worker/transactions">See all your tips <ArrowUpRight size={14}/></Link><DemoFlag demo={d.isDemo}/></section></div><section className="surface data-section"><div className="section-heading"><div><div className="panel-kicker">RECENT KINDNESS</div><h3>Latest tips</h3></div><Link href="/worker/transactions" className="text-link">All transactions <ArrowUpRight size={14}/></Link></div><TransactionTable transactions={d.recentTransactions}/></section></>}</QueryState></PortalLayout>;
}
function WorkerTransactions() {
  const q=useListWorkerTransactions({query:{queryKey:getListWorkerTransactionsQueryKey()}});
  return <PortalLayout title="Transactions"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}><div className="welcome-row"><div><div className="eyebrow">A record of every thank you</div><h2>Every tip, in one place.</h2><p>See what guests have sent your way and when.</p></div><DemoFlag demo={q.data?.some(x=>x.isDemo)}/></div><section className="surface data-section"><div className="section-heading"><div><div className="panel-kicker">TIP HISTORY</div><h3>All transactions <span className="subtle-count">{q.data?.length ?? 0}</span></h3></div><button onClick={()=>downloadCsv(q.data||[],'sanad-worker-transactions.csv')} className="outline-button"><Download size={15}/> Export</button></div><TransactionTable transactions={q.data}/></section></QueryState></PortalLayout>;
}
function PayoutList({ payouts, empty, onStatusChange, updatingId }: { payouts?: PayoutRecord[]; empty: string; onStatusChange?: (payout: PayoutRecord) => void; updatingId?: string }) {
  const { language } = useLanguage();
  if(!payouts?.length) return <EmptyPanel title="No payout records yet" text={empty}/>;
  return <LocalizedTree><div className="table-scroll"><table className="data-table"><thead><tr><th>Payroll period</th><th>Recorded</th><th>Amount</th><th>Status</th>{onStatusChange&&<th>Update record</th>}</tr></thead><tbody>{payouts.map((p)=><tr key={p.id}><td><div><b>{monthName(p.month,language)}</b><small>{p.note||'SANAD payout record'}{p.isDemo?' · Demo':''}</small></div></td><td>{dateLabel(p.recordedAt,language)}</td><td className="table-amount">{money(p.amountFils)}</td><td><Badge status={p.status}/></td>{onStatusChange&&<td><button className="outline-button compact" disabled={updatingId===p.id} onClick={()=>onStatusChange(p)}>{updatingId===p.id?'Saving…':p.status==='paid'?'Mark pending':'Mark paid'}</button></td>}</tr>)}</tbody></table></div></LocalizedTree>;
}
function WorkerEarnings() {
  const d=useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  const p=useListWorkerPayouts({query:{queryKey:getListWorkerPayoutsQueryKey()}});
  return <PortalLayout title="Earnings & payouts"><QueryState loading={d.isLoading||p.isLoading} error={d.isError||p.isError} retry={()=>{void d.refetch();void p.refetch()}}>{d.data&&<><div className="welcome-row"><div><div className="eyebrow">Clear records, no guesswork</div><h2>Your earnings, accounted for.</h2><p>Tips are tracked separately from payroll payouts.</p></div><DemoFlag demo={d.data.isDemo||p.data?.some(x=>x.isDemo)}/></div><div className="metric-grid metric-grid-three"><Metric label="Total tips" value={money(d.data.totalTipsFils)} caption="All time" icon={Wallet}/><Metric label="Pending tips" value={money(d.data.pendingTipsFils)} caption="Awaiting payroll" icon={Clock3} accent/><Metric label="Paid in payroll" value={money(d.data.paidTipsFils)} caption="Recorded payouts" icon={Check}/></div><section className="surface data-section"><div className="section-heading"><div><div className="panel-kicker">PAYROLL RECORD</div><h3>Payout history</h3></div></div><PayoutList payouts={p.data} empty="Your company’s payroll records will appear here."/></section></>}</QueryState></PortalLayout>;
}
function WorkerQr() {
  const q=useGetWorkerBadge({query:{queryKey:getGetWorkerBadgeQueryKey()}});
  const [copied,setCopied]=useState(false);
  const rawUrl=q.data ? q.data.tippingUrl || `${window.location.origin}${basePath}/tip/${q.data.workerSlug}` : '';
  const url=rawUrl ? baseAwareUrl(rawUrl) : '';
  const copy=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}};
  return <PortalLayout title="My QR badge"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{q.data&&<><div className="welcome-row"><div><div className="eyebrow">Make appreciation easy</div><h2>Your personal tip badge.</h2><p>Share this code with guests who want to thank you.</p></div><DemoFlag demo={q.data.isDemo}/></div><div className="qr-page-grid"><section className="surface qr-preview"><div className="badge-company">{q.data.companyName}</div><Avatar name={q.data.workerName} size="md"/><h3>{q.data.workerName}</h3><span>Scan to leave a tip</span><div className="qr-large"><QRCodeSVG className="real-qr" value={url} size={190} level="H" includeMargin fgColor="#3B1720" bgColor="#FFFFFF" title={`SANAD tip QR for ${q.data.workerName}`}/></div><small>Powered by SANAD</small></section><section className="surface qr-instructions"><div className="panel-kicker">YOUR TIP LINK</div><h3>One link. One easy thank you.</h3><p>Guests can scan your QR or visit your personal link. They don’t need to create an account.</p><div className="copy-link"><span>{url}</span><button onClick={()=>void copy()} data-testid="button-copy-link">{copied?<Check size={15}/>:<span>Copy</span>}</button></div><div className="notice-box"><ShieldCheck size={17}/><span>Your badge is linked to your worker account. Tips are recorded securely and can be reviewed anytime.</span></div><PillButton onClick={()=>window.print()} className="download-badge"><Download size={15}/> Print my badge</PillButton></section></div></>}</QueryState></PortalLayout>;
}
function WorkerSettings() {
  const q=useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  return <PortalLayout title="Settings"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{q.data&&<><div className="welcome-row"><div><div className="eyebrow">Your SANAD profile</div><h2>Your details, kept simple.</h2><p>Profile information is managed by your company.</p></div></div><section className="surface settings-panel"><div className="settings-person"><Avatar name={q.data.worker.name}/><div><h3>{q.data.worker.name}</h3><span>{q.data.worker.role} · {q.data.worker.branch}</span></div><Badge status={q.data.worker.status}/></div><div className="settings-row"><span>Display name</span><strong>{q.data.worker.name}</strong></div><div className="settings-row"><span>Arabic name</span><strong className="arabic">{q.data.worker.arabicName||'—'}</strong></div><div className="settings-row"><span>Email address</span><strong>{q.data.worker.email||'—'}</strong></div><div className="settings-row"><span>Team / branch</span><strong>{q.data.worker.branch||'—'}</strong></div><div className="notice-box"><ShieldCheck size={17}/><span>Need to update something? Ask your company manager to change your profile details.</span></div></section></>}</QueryState></PortalLayout>;
}

function CompanyOnboarding() {
  const create=useCreateCompanyProfile();
  const qc=useQueryClient();
  const [name,setName]=useState('');const [registration,setRegistration]=useState('');const [email,setEmail]=useState('');
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{name,registrationNumber:registration||null,contactEmail:email||null}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()});void qc.invalidateQueries({queryKey:getListCompanyWorkersQueryKey()})}})};
  return <LocalizedTree><div className="onboarding-wrap"><div className="onboarding-story"><div className="onboarding-seal"><BadgeCheck size={22}/></div><div className="eyebrow">A GOOD PLACE TO BEGIN</div><h2>Let’s set up<br/><em>your company.</em></h2><p>Once your company details are in, you can invite your team, give every worker a SANAD QR badge, and see appreciation add up.</p><div className="onboarding-points"><span><Check size={15}/>Company-wide tip records</span><span><Check size={15}/>Personal QR badges for workers</span><span><Check size={15}/>Clear payroll history</span></div></div><form className="surface onboarding-form" onSubmit={submit}><div className="panel-kicker">COMPANY PROFILE</div><h3>Tell us about your business</h3><p>This creates your company workspace. You can update these details later.</p><label>Company name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Marina House"/></label><label>Commercial registration number<input maxLength={100} value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="Optional"/></label><label>Contact email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="team@company.com"/></label>{create.isError&&<div className="form-notice" role="alert">We couldn’t set up your company. Please check your details and try again.</div>}<PillButton type="submit" disabled={create.isPending}>{create.isPending?'Setting up your workspace…':'Create company workspace'} <ArrowUpRight size={15}/></PillButton><small><ShieldCheck size={13}/> Your company details stay within your workspace.</small></form></div></LocalizedTree>;
}
function CompanyOverview() {
  const q=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey()}});
  const workers=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
  const notConfigured=q.isError&&isHttp404(q.error);
  return <PortalLayout company title={notConfigured?'Set up your company':'Company overview'}><QueryState loading={q.isLoading||(!q.isError&&workers.isLoading)} error={(q.isError&&!notConfigured)||(!q.isError&&workers.isError)} retry={()=>{void q.refetch();void workers.refetch()}}>{notConfigured?<CompanyOnboarding/>:q.data&&<><div className="welcome-row"><div><div className="eyebrow">Your team’s appreciation, at a glance</div><h2>Good afternoon, {q.data.company.name.split(' ')[0]}.</h2><p>Here’s the latest from the people making your service memorable.</p></div><DemoFlag demo={q.data.isDemo}/></div><div className="metric-grid"><Metric label="Tips received" value={money(q.data.totalTipsFils)} caption="Across your team" icon={Wallet} accent/><Metric label="This month" value={money(q.data.monthTipsFils)} caption="All team tips" icon={ArrowUpRight}/><Metric label="Pending payroll" value={money(q.data.pendingTipsFils)} caption="Ready to record" icon={Clock3}/><Metric label="Active workers" value={String(q.data.activeWorkers)} caption="On your team" icon={Users}/></div><div className="portal-columns"><section className="surface chart-surface"><TrendChart values={q.data.monthly} label="Team tip activity"/></section><section className="surface people-card"><div className="section-heading"><div><div className="panel-kicker">YOUR PEOPLE</div><h3>Team at a glance</h3></div><Link href="/company/workers" className="text-link">View all <ArrowUpRight size={14}/></Link></div>{workers.data?.slice(0,4).map((w)=><div className="person-row" key={w.id}><Avatar name={w.name} size="sm"/><span><b>{w.name}</b><small>{w.role}</small></span><b className="person-total">{money(w.totalTipsFils)}</b></div>)}</section></div><section className="surface data-section"><div className="section-heading"><div><div className="panel-kicker">LATEST ACTIVITY</div><h3>Recent tips</h3></div><Link href="/company/transactions" className="text-link">All transactions <ArrowUpRight size={14}/></Link></div><TransactionTable transactions={q.data.recentTransactions}/></section></>}</QueryState></PortalLayout>;
}
function CompanyWorkers() {
  const q=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
  const create=useCreateCompanyWorker();
  const update=useUpdateCompanyWorker();
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);
  const [name,setName]=useState('');const [arabic,setArabic]=useState('');const [email,setEmail]=useState('');const [role,setRole]=useState('');const [branch,setBranch]=useState('');
  const [filter,setFilter]=useState('');
  const refresh=()=>qc.invalidateQueries({queryKey:getListCompanyWorkersQueryKey()});
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{name,arabicName:arabic||null,email:email||null,role,branch:branch||null}},{onSuccess:()=>{void refresh();setOpen(false);setName('');setEmail('');setRole('')}})};
  const visible=(q.data||[]).filter(w=>`${w.name} ${w.role} ${w.branch||''}`.toLowerCase().includes(filter.toLowerCase()));
  return <PortalLayout company title="Workers"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}><div className="welcome-row"><div><div className="eyebrow">The people who make it happen</div><h2>Your team, all together.</h2><p>Manage worker details and see each person’s tip profile.</p></div><button className="solid-button" onClick={()=>setOpen(true)}><Users size={15}/> Add a worker</button></div><section className="surface data-section"><div className="section-heading"><div><div className="panel-kicker">TEAM DIRECTORY</div><h3>Workers <span className="subtle-count">{visible.length}</span></h3></div><div className="searchbox"><Search size={15}/><input data-testid="input-worker-search" placeholder="Find a worker" value={filter} onChange={e=>setFilter(e.target.value)}/></div></div>{visible.length? <div className="table-scroll"><table className="data-table"><thead><tr><th>Worker</th><th>Role & branch</th><th>Tips received</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map((w)=><tr key={w.id}><td><div className="table-person"><Avatar name={w.name} size="sm"/><span><b>{w.name}</b><small>{w.email||'No email added'}</small></span></div></td><td><div><b>{w.role}</b><small>{w.branch||'No branch'}</small></div></td><td className="table-amount">{money(w.totalTipsFils)}</td><td><Badge status={w.status}/></td><td><button className="outline-button compact" disabled={update.isPending} onClick={()=>update.mutate({workerId:w.id,data:{status:w.status==='active'?'inactive':'active'}},{onSuccess:()=>void refresh()})}>{w.status==='active'?'Pause':'Activate'}</button></td></tr>)}</tbody></table></div>:<EmptyPanel title="No team members found" text="Try another name or add your first worker."/>}</section></QueryState>{open&&<div className="modal-backdrop" role="presentation"><form className="modal-card" onSubmit={submit}><button type="button" className="modal-close" onClick={()=>setOpen(false)} aria-label="Close"><X size={17}/></button><div className="eyebrow">GROW YOUR TEAM</div><h2>Add a worker</h2><p>We’ll create their SANAD profile and personal QR link.</p><label>Full name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Faisal Al-Rashid"/></label><label>Arabic name <input dir="rtl" value={arabic} onChange={e=>setArabic(e.target.value)} placeholder="الاسم بالعربية"/></label><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><div className="modal-split"><label>Role<input required value={role} onChange={e=>setRole(e.target.value)} placeholder="Barista"/></label><label>Branch<input value={branch} onChange={e=>setBranch(e.target.value)} placeholder="Salmiya"/></label></div>{create.isError&&<div className="form-notice">We couldn’t add this worker. Please check the details.</div>}<PillButton type="submit" disabled={create.isPending}>{create.isPending?'Adding worker…':'Add worker'} <ArrowUpRight size={15}/></PillButton></form></div>}</PortalLayout>;
}
function CompanyTransactions() {
  const q=useListCompanyTransactions({query:{queryKey:getListCompanyTransactionsQueryKey()}});
  const [search,setSearch]=useState('');
  const data=(q.data||[]).filter(t=>t.workerName.toLowerCase().includes(search.toLowerCase()));
  return <PortalLayout company title="Transactions"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}><div className="welcome-row"><div><div className="eyebrow">A transparent record for your team</div><h2>Every tip, clearly tracked.</h2><p>Review tips received across your company.</p></div><DemoFlag demo={q.data?.some(t=>t.isDemo)}/></div><section className="surface data-section"><div className="section-heading"><div><div className="panel-kicker">ALL TEAM TIPS</div><h3>Transactions <span className="subtle-count">{data.length}</span></h3></div><div className="section-tools"><div className="searchbox"><Search size={15}/><input placeholder="Search workers" value={search} onChange={e=>setSearch(e.target.value)}/></div><button onClick={()=>downloadCsv(data,'sanad-company-transactions.csv')} className="outline-button"><Download size={15}/> Export</button></div></div><TransactionTable transactions={data}/></section></QueryState></PortalLayout>;
}
function CompanyPayouts() {
  const q=useListCompanyPayouts({query:{queryKey:getListCompanyPayoutsQueryKey()}});
  const workers=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
  const create=useCreateCompanyPayout();
  const updateStatus=useUpdateCompanyPayoutStatus();
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);const [workerId,setWorkerId]=useState('');const [amount,setAmount]=useState('');const [month,setMonth]=useState(kuwaitMonth);const [note,setNote]=useState('');
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{workerId,amountFils:Math.round(Number(amount)*1000),month,note:note||null}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListCompanyPayoutsQueryKey()});void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()});setOpen(false)}})};
  const changeStatus=(payout:PayoutRecord)=>updateStatus.mutate({payoutId:payout.id,data:{status:payout.status==='paid'?'pending':'paid'}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListCompanyPayoutsQueryKey()});void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()})}});
  return <PortalLayout company title="Payouts"><QueryState loading={q.isLoading||workers.isLoading} error={q.isError||workers.isError} retry={()=>{void q.refetch();void workers.refetch()}}><div className="welcome-row"><div><div className="eyebrow">Tip records meet payroll</div><h2>Keep payouts easy to follow.</h2><p>Record a payout against a worker and payroll month. This creates a record only.</p></div><button className="solid-button" onClick={()=>setOpen(true)}><Banknote size={15}/> Record a payout</button></div><div className="notice-box payroll-notice"><ShieldCheck size={17}/><span>Marking a record paid means your employer recorded it in payroll. SANAD does not initiate or verify a bank transfer.</span></div>{updateStatus.isError&&<div className="form-notice" role="alert">Could not update this payroll record. Please try again.</div>}<section className="surface data-section"><div className="section-heading"><div><div className="panel-kicker">PAYROLL RECORDS</div><h3>Payout history <span className="subtle-count">{q.data?.length??0}</span></h3></div><DemoFlag demo={q.data?.some(x=>x.isDemo)}/></div><PayoutList payouts={q.data} empty="Recorded payouts will appear here." onStatusChange={changeStatus} updatingId={updateStatus.isPending ? updateStatus.variables?.payoutId : undefined}/></section></QueryState>{open&&<div className="modal-backdrop"><form className="modal-card" onSubmit={submit}><button type="button" className="modal-close" onClick={()=>setOpen(false)} aria-label="Close"><X size={17}/></button><div className="eyebrow">PAYROLL RECORD</div><h2>Record a payout</h2><p>This records a payment already handled through your payroll process.</p><label>Worker<select required value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Select a worker</option>{workers.data?.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select></label><div className="modal-split"><label>Amount in KWD<input required type="number" min="0.001" step="0.001" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.000"/></label><label>Payroll month<input required type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div><label>Note (optional)<textarea maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional reference for this payroll record"/></label>{create.isError&&<div className="form-notice">Could not save payout. Please try again.</div>}<PillButton type="submit" disabled={create.isPending||!workerId}>{create.isPending?'Saving record…':'Save payout record'} <ArrowUpRight size={15}/></PillButton></form></div>}</PortalLayout>;
}
function CompanyReports() {
  const { language } = useLanguage();
  const monthState=useState(kuwaitMonth);
  const [month,setMonth]=monthState;
  const q=useGetCompanyReport({month},{query:{queryKey:getGetCompanyReportQueryKey({month}),enabled:!!month}});
  return <PortalLayout company title="Reports"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}><div className="welcome-row"><div><div className="eyebrow">A clearer view, month by month</div><h2>Your monthly picture.</h2><p>Tip activity and payroll records, together.</p></div><label className="month-picker"><span>REPORTING PERIOD</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div>{q.data&&<><div className="metric-grid"><Metric label="Tips received" value={money(q.data.tipsFils)} caption={monthName(q.data.month,language)} icon={Wallet} accent/><Metric label="Awaiting payroll" value={money(q.data.pendingFils)} caption="Pending payout records" icon={Clock3}/><Metric label="Paid out" value={money(q.data.paidOutFils)} caption="Recorded for payroll" icon={Banknote}/><Metric label="Tip transactions" value={String(q.data.transactionCount)} caption={`${q.data.workerCount} workers`} icon={Users}/></div><section className="surface report-panel"><div className="report-title"><div className="report-icon"><FileText/></div><div><span className="panel-kicker">SANAD MONTHLY REPORT</span><h3>{monthName(q.data.month,language)}</h3></div><DemoFlag demo={q.data.isDemo}/></div><div className="report-rows"><div><span>Total tips received</span><strong>{money(q.data.tipsFils)}</strong></div><div><span>Pending payroll</span><strong>{money(q.data.pendingFils)}</strong></div><div><span>Paid out and recorded</span><strong>{money(q.data.paidOutFils)}</strong></div><div><span>Team members with activity</span><strong>{q.data.workerCount}</strong></div><div><span>Individual tip transactions</span><strong>{q.data.transactionCount}</strong></div></div><button className="outline-button" onClick={()=>downloadCsv([{month:monthName(q.data!.month),tips:money(q.data!.tipsFils),pending:money(q.data!.pendingFils),paidOut:money(q.data!.paidOutFils),workers:q.data!.workerCount,transactions:q.data!.transactionCount}],'sanad-monthly-report.csv')}><Download size={15}/> Download report</button></section></>}</QueryState></PortalLayout>;
}
function CompanySettings() {
  const q=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey()}});
  const create=useCreateCompanyProfile();
  const qc=useQueryClient();
  const [name,setName]=useState('');const [registration,setRegistration]=useState('');const [email,setEmail]=useState('');const [saved,setSaved]=useState(false);
  useEffect(()=>{if(q.data){setName(q.data.company.name);setRegistration(q.data.company.registrationNumber||'');setEmail(q.data.company.contactEmail||'')}},[q.data]);
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{name,registrationNumber:registration||null,contactEmail:email||null}},{onSuccess:()=>{setSaved(true);void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()})}})};
  const notConfigured=q.isError&&isHttp404(q.error);
  return <PortalLayout company title={notConfigured?'Set up your company':'Settings'}><QueryState loading={q.isLoading} error={q.isError&&!notConfigured} retry={()=>void q.refetch()}>{notConfigured?<CompanyOnboarding/>:q.data&&<><div className="welcome-row"><div><div className="eyebrow">The details behind your team</div><h2>Company information.</h2><p>Keep your company contact details accurate.</p></div></div><form className="surface settings-form" onSubmit={submit}><div className="panel-kicker">COMPANY PROFILE</div><h3>Your company details</h3><label>Company name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label>Commercial registration number<input maxLength={100} value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="Optional"/></label><label>Contact email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="team@company.com"/></label><div className="notice-box"><ShieldCheck size={17}/><span>Your team’s records are private to your company account.</span></div>{create.isError&&<div className="form-notice">We couldn’t save the profile. Please try again.</div>}{saved&&<div className="success-notice"><Check size={15}/> Company details saved.</div>}<PillButton type="submit" disabled={create.isPending}>{create.isPending?'Saving…':'Save company details'} <ArrowUpRight size={15}/></PillButton><DemoFlag demo={q.data.isDemo}/></form></>}</QueryState></PortalLayout>;
}
function AuthPage({ signup=false }: { signup?:boolean }) {
  return <LocalizedTree><main className="auth-page"><div className="auth-brand"><Brand/><LanguageToggle/></div><div className="auth-copy"><div className="eyebrow">A better way to say thank you</div><h1>Good service<br/><em>deserves a SANAD.</em></h1><p>Simple, thoughtful, and here when you need it.</p></div><div className="auth-clerk">{signup?<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/`}/>:<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/`}/>}</div><div className="auth-footer"><Brand/><span>Made with care in Kuwait.</span></div></main></LocalizedTree>;
}
function SignedInHome() {
  const worker = useGetWorkerDashboard({ query: { queryKey: getGetWorkerDashboardQueryKey(), retry: false } });
  if (worker.isLoading) return <main className="home-routing"><Skeleton rows={4}/></main>;
  return <Redirect to={worker.data ? '/worker' : '/company'}/>;
}
function HomeRedirect() {
  return <><Show when="signed-in"><SignedInHome/></Show><Show when="signed-out"><Landing/></Show></>;
}
function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/sign-in"/></Show></>;
}
function AuthRoutes() {
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to your SANAD account'}},signUp:{start:{title:'Join SANAD',subtitle:'Bring a little more appreciation to your team'}}}} routerPush={(to)=>setLocation(stripBase(to))} routerReplace={(to)=>setLocation(stripBase(to),{replace:true})}>
    <Switch>
      <Route path="/" component={HomeRedirect}/>
      <Route path="/sign-in/*?" component={()=> <AuthPage/>}/>
      <Route path="/sign-up/*?" component={()=> <AuthPage signup/>}/>
      <Route path="/tip/:slug" component={TipPage}/>
      <Route path="/tip-confirmation" component={ConfirmationPage}/>
      <Route path="/worker" component={()=> <Protected><WorkerOverview/></Protected>}/>
      <Route path="/worker/transactions" component={()=> <Protected><WorkerTransactions/></Protected>}/>
      <Route path="/worker/earnings" component={()=> <Protected><WorkerEarnings/></Protected>}/>
      <Route path="/worker/qr" component={()=> <Protected><WorkerQr/></Protected>}/>
      <Route path="/worker/settings" component={()=> <Protected><WorkerSettings/></Protected>}/>
      <Route path="/company" component={()=> <Protected><CompanyOverview/></Protected>}/>
      <Route path="/company/workers" component={()=> <Protected><CompanyWorkers/></Protected>}/>
      <Route path="/company/transactions" component={()=> <Protected><CompanyTransactions/></Protected>}/>
      <Route path="/company/payouts" component={()=> <Protected><CompanyPayouts/></Protected>}/>
      <Route path="/company/reports" component={()=> <Protected><CompanyReports/></Protected>}/>
      <Route path="/company/settings" component={()=> <Protected><CompanySettings/></Protected>}/>
      <Route component={NotFound}/>
    </Switch>
  </ClerkProvider>;
}
function App() {
  const [language,setLanguage]=useState<Language>(()=>localStorage.getItem('sanad-language')==='ar'?'ar':'en');
  const toggle=()=>setLanguage((prev)=>{const next=prev==='en'?'ar':'en';localStorage.setItem('sanad-language',next);document.documentElement.dir=next==='ar'?'rtl':'ltr';document.documentElement.lang=next;return next});
  useEffect(()=>{document.documentElement.dir=language==='ar'?'rtl':'ltr';document.documentElement.lang=language},[language]);
  return <QueryClientProvider client={queryClient}><TooltipProvider><LanguageContext.Provider value={{language,toggle}}><WouterRouter base={basePath}><div className="grain"><ErrorBoundary><AuthRoutes/></ErrorBoundary></div></WouterRouter><Toaster/></LanguageContext.Provider></TooltipProvider></QueryClientProvider>;
}
function downloadCsv(rows: Array<Record<string,unknown>> | TipTransaction[], filename:string) {
  const list=rows as Array<Record<string,unknown>>;
  if(!list.length)return;
  const headers=Object.keys(list[0]);
  const csv=[headers.join(','),...list.map(row=>headers.map(key=>`"${String(row[key]??'').replaceAll('"','""')}"`).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
}
export default App;
