import { useEffect, useRef, useState, createContext, useContext, Children, cloneElement, isValidElement, type ReactNode, type FormEvent } from 'react';
import './sanad.css';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QRCodeSVG } from 'qrcode.react';
import { Route, Switch, Router as WouterRouter, Link, Redirect, useLocation, useRoute } from 'wouter';
import {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, Banknote, BarChart3, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Copy, Download, FileText, Globe2, Handshake, Heart, KeyRound, LayoutDashboard, LogIn, LogOut, Menu,
  Phone, QrCode, Search, Settings, ShieldCheck, Sparkles, Star, Users, Wallet, X
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
  useUpdateCompanyPayoutStatus, useGetCompanyReport, getGetCompanyReportQueryKey,
  useWorkerLogin, useGetWorkerAuthSession, getGetWorkerAuthSessionQueryKey,
  useChangeWorkerPassword, useWorkerLogout, useIssueWorkerTemporaryPassword
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
  'Overview':'نظرة عامة','Your overview':'نظرتك العامة','Company overview':'نظرة عامة للشركة','Transactions':'المعاملات','Earnings':'الأرباح','QR Badges':'رموز QR',
  'FOR GUESTS':'للضيوف','FOR COMPANIES':'للشركات','KUWAIT · DIGITAL TIPPING':'الكويت · إكراميات رقمية',
  'Tip Now':'أرسل إكرامية','For guests':'للضيوف','For business':'للشركات','A simple way':'طريقة بسيطة','to say':'لنقول',
  'A clearer way':'طريقة أوضح','to value':'لتقدير','your team.':'فريقك.','A personal badge':'رمز شخصي',
  'For every team member':'لكل فرد في الفريق','Clear records':'سجلات واضحة','Create a company account':'إنشاء حساب شركة',
  'Scan a worker’s QR badge to begin.':'امسح رمز الموظف للبدء.',
  'Choose an amount, add an optional rating, then check out securely.':'اختر المبلغ، وأضف تقييماً اختيارياً، ثم ادفع بأمان.',
  'Secure checkout · No account needed':'دفع آمن · لا حاجة إلى حساب','No sign-up. No extra steps.':'لا تسجيل ولا خطوات إضافية.',
  'Guest tipping links':'روابط إكراميات الضيوف','Worker QR badges.':'رموز QR للموظفين.',
  'Each badge opens that worker’s existing SANAD tip page.':'يفتح كل رمز صفحة الإكرامية الخاصة بالموظف.',
  'Copy link':'نسخ الرابط','Open tip page':'فتح صفحة الإكرامية','Copied':'تم النسخ',
  'Custom amount':'مبلغ مخصص','Rating (optional)':'التقييم (اختياري)',
  'Secure card payment via Stripe.':'دفع آمن بالبطاقة عبر Stripe.',
  'Test mode · No real payment.':'وضع اختبار · لا يوجد دفع حقيقي.',
  'KWD payments aren’t available yet. No payment was made.':'مدفوعات الدينار غير متاحة بعد. لم يتم تحصيل أي مبلغ.',
  'Live payments aren’t enabled yet. No payment was made.':'المدفوعات الحقيقية غير مفعّلة بعد. لم يتم تحصيل أي مبلغ.',
  'Opening secure checkout…':'جارٍ فتح الدفع الآمن…','Pay':'ادفع',
  'My QR Badge':'رمز QR الخاص بي','Tip history':'سجل الإكراميات',
  'Payroll records':'سجلات الرواتب','Company-entered records · No bank transfer.':'سجلات الشركة · لا توجد تحويلات مصرفية.',
  'Worker badges':'رموز الموظفين','Team':'الفريق','Add worker':'إضافة موظف',
  'Share your badge':'شارك رمزك','Scan to tip':'امسح للإكرامية','TIP LINK':'رابط الإكرامية',
  'Print badge':'طباعة الرمز','Payroll record only · SANAD does not send bank transfers.':'سجل رواتب فقط · لا ترسل سند تحويلات مصرفية.',
  'Payroll records only · SANAD does not send bank transfers.':'سجلات الرواتب فقط · لا ترسل سند تحويلات مصرفية.',
  'No active worker badges':'لا توجد رموز لموظفين نشطين','Activate a worker to show their QR code.':'فعّل موظفاً لإظهار رمز QR الخاص به.',
  'COMPANY SETUP':'إعداد الشركة',
  'MONTHLY REPORT':'التقرير الشهري','Month':'الشهر',
  'Your tips, month by month.':'إكرامياتك شهراً بعد شهر.','Earnings summary':'ملخص الأرباح',
  'Recorded payroll.':'سجلات الرواتب.','Employer-entered payroll history':'سجل الرواتب الذي أدخله صاحب العمل.',
  'These records are entered by your company.':'تُدخل شركتك هذه السجلات.','Team overview':'نظرة عامة للفريق',
  'Manage Workers':'إدارة الموظفين','RECENT TIPS':'أحدث الإكراميات',
  'Earnings & payouts':'الأرباح والمدفوعات','My QR badge':'رمز QR الخاص بي','Settings':'الإعدادات','Workers':'الموظفون',
  'Payouts':'المدفوعات','Reports':'التقارير','MANAGE YOUR TEAM':'إدارة فريقك','YOUR SANAD':'حسابك في سند',
  'Need a hand?':'هل تحتاج إلى مساعدة؟','We’re here to help.':'نحن هنا لمساعدتك.','Get in touch':'تواصل معنا',
  'Company manager':'مدير الشركة','Service team':'فريق الخدمة','A little recognition adds up':'التقدير يصنع فرقاً',
  'Good to see you,':'يسعدنا وجودك،','Your service is making a difference. Here’s how it’s adding up.':'خدمتك تصنع فرقاً. إليك ملخص تقدير الضيوف.',
  'Tips received':'الإكراميات المستلمة','This month':'هذا الشهر','Awaiting payout':'بانتظار التسجيل في الرواتب',
  'Guest rating':'تقييم الضيوف','Average rating':'متوسط التقييم','No ratings yet':'لا توجد تقييمات بعد','All time':'الإجمالي','Since the 1st':'منذ بداية الشهر','Not yet in payroll':'لم تُسجل في الرواتب بعد',
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
  'Phone number':'رقم الهاتف','No phone number':'لا يوجد رقم هاتف','Reset password':'إعادة تعيين كلمة المرور',
  'WORKER LOGIN':'دخول الموظف','Sign out':'تسجيل الخروج','No email added':'لم يضف بريداً إلكترونياً','No branch':'لا يوجد فرع','Pause':'إيقاف مؤقت','Activate':'تفعيل',
  'Give this temporary password to the worker directly. It is shown only once.':'سلّم كلمة المرور المؤقتة للموظف مباشرةً. ستظهر مرة واحدة فقط.',
  'The worker signs in with their phone number and changes this password at first sign-in.':'يسجّل الموظف الدخول برقم هاتفه ويغيّر كلمة المرور عند أول دخول.',
  'Couldn’t add this worker. Check the phone number and try again.':'تعذرت إضافة الموظف. تحقق من رقم الهاتف وحاول مجدداً.',
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
  'This Stripe account cannot accept KWD yet. No payment was made. Add a KWD bank account in Stripe settings.':'لا يمكن لحساب Stripe هذا قبول الدينار الكويتي بعد. لم يتم تحصيل أي مبلغ. أضف حساباً بنكياً يدعم الدينار الكويتي في إعدادات Stripe.',
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
  return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} data-testid="link-brand"><span className="brand-mark"><Handshake aria-hidden="true" strokeWidth={2.1}/></span><span>SANAD<span className="brand-dot">.</span></span></Link>;
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
  return <header className="site-header"><Brand/><nav className="public-nav"><a href="#tip-now" data-testid="link-nav-guests">{language === 'ar' ? 'للضيوف' : 'For guests'}</a><a href="#for-business" data-testid="link-nav-business">{language === 'ar' ? 'للشركات' : 'For business'}</a></nav><div className="header-actions"><LanguageToggle/><Link className="header-worker-signin" href="/worker/sign-in" aria-label={language === 'ar' ? 'تسجيل دخول العامل' : 'Worker sign in'} data-testid="link-sign-in"><LogIn size={14}/><span className="worker-signin-full">{language === 'ar' ? 'تسجيل دخول العامل' : 'Worker sign in'}</span><span className="worker-signin-compact">{language === 'ar' ? 'العامل' : 'Worker'}</span></Link><Link className="header-signup" href="/sign-up" data-testid="link-get-started">{language === 'ar' ? 'ابدأ الآن' : 'Get started'} <ArrowUpRight size={15}/></Link></div></header>;
}
function Landing() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const previousLanguage = useRef(language);
  const [demoAmount, setDemoAmount] = useState(1);
  const [demoRating, setDemoRating] = useState<number | null>(null);
  const [demoComplete, setDemoComplete] = useState(false);
  const [languageSwitching, setLanguageSwitching] = useState(false);
  useEffect(() => {
    if (previousLanguage.current === language) return;
    previousLanguage.current = language;
    setLanguageSwitching(true);
    const timeout = window.setTimeout(() => setLanguageSwitching(false), 220);
    return () => window.clearTimeout(timeout);
  }, [language]);
  useEffect(() => {
    const nodes = document.querySelectorAll('.landing-reveal');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  const demoAmounts = ['0.500', '1.000', '2.000'];
  return <LocalizedTree><main className={`landing ${languageSwitching ? 'language-switching' : ''}`}>
    <Header/>
    <section className="hero-wrap landing-compact">
      <div className="hero-copy landing-hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> {ar ? 'الكويت · إكراميات رقمية' : 'KUWAIT · DIGITAL TIPPING'}</div>
        <h1>{ar ? <>شكراً،<br/><em>بطريقة أسهل.</em></> : <>A simple way<br/>to say <em>thank you.</em></>}</h1>
        <div className="hero-actions"><Link href="/tip/ahmed-almutairi" className="cta-primary" data-testid="link-tip-now">{ar ? 'أرسل إكرامية' : 'Tip Now'} <ArrowUpRight size={17}/></Link><Link href="/sign-up" className="cta-quiet" data-testid="link-company-signup-hero">{ar ? 'للشركات' : 'For companies'} <ChevronRight size={16}/></Link></div>
        <div className="trust-note"><ShieldCheck size={16}/><span>{ar ? 'دفع آمن · لا حاجة لإنشاء حساب' : 'Secure checkout · No account needed'}</span></div>
      </div>
      <div className="hero-art rise landing-mark-art" aria-hidden="true"><div className="art-sun"/><div className="landing-mark"><Handshake className="landing-handshake" strokeWidth={1.45}/></div><div className="hero-caption"><span>SANAD · سند</span><span>KUWAIT</span></div><div className="sadu art-pattern"/></div>
    </section>
    <section className="how-section landing-reveal" aria-labelledby="how-title">
      <div className="how-heading"><span className="eyebrow">{ar ? 'بكل بساطة' : 'THOUGHTFULLY SIMPLE'}</span><h2 id="how-title">{ar ? 'ثلاث خطوات، وشكر يصل.' : 'Three steps. A thank you delivered.'}</h2></div>
      <div className="how-steps">
        <article className="how-step"><span className="how-icon"><QrCode size={21}/></span><small>01</small><h3>{ar ? 'امسح الرمز' : 'Scan the badge'}</h3><p>{ar ? 'امسح رمز الموظف لفتح صفحة سند الخاصة به.' : 'Scan the worker’s QR badge to open their SANAD page.'}</p></article>
        <article className="how-step"><span className="how-icon"><Banknote size={21}/></span><small>02</small><h3>{ar ? 'اختر إكراميتك' : 'Choose your tip'}</h3><p>{ar ? 'اختر المبلغ وأضف تقييماً إن رغبت.' : 'Pick an amount and leave a rating if you like.'}</p></article>
        <article className="how-step"><span className="how-icon"><ShieldCheck size={21}/></span><small>03</small><h3>{ar ? 'ادفع بأمان' : 'Check out securely'}</h3><p>{ar ? 'أكمل الدفع الآمن دون إنشاء حساب.' : 'Complete secure checkout. No account needed.'}</p></article>
      </div>
    </section>
    <section id="tip-now" className="landing-tip-band landing-reveal"><div className="guest-intro"><span className="eyebrow">{ar ? 'للضيوف' : 'FOR GUESTS'}</span><h2>{ar ? 'امسح رمز الموظف للبدء.' : 'Scan a worker’s QR badge to begin.'}</h2><p>{ar ? 'جرّب المعاينة، أو أرسل إكرامية حقيقية من صفحة الموظف.' : 'Try the preview, or send a real tip from a worker’s page.'}</p></div><div className="landing-trust"><ShieldCheck size={19}/><span>{ar ? 'لا تسجيل. لا خطوات إضافية.' : 'No sign-up. No extra steps.'}</span></div>
      <div className="tip-demo" aria-live="polite">
        <div className="demo-heading"><div><span className="demo-label">{ar ? 'معاينة تفاعلية' : 'INTERACTIVE PREVIEW'}</span><strong>{ar ? 'جرّب إرسال الشكر' : 'Try a little thank you'}</strong></div><span className="demo-only">{ar ? 'عرض فقط · لا يوجد دفع' : 'DEMO ONLY · NO PAYMENT'}</span></div>
        {demoComplete ? <div className="demo-success"><span className="demo-success-icon"><Check size={20}/></span><div><strong>{ar ? 'معاينتك جاهزة.' : 'Your preview is ready.'}</strong><span data-testid="text-demo-confirmation">{ar ? `المبلغ KWD ${demoAmounts[demoAmount]}${demoRating ? ` · التقييم ${demoRating}/5` : ''}. لا يوجد دفع أو حفظ بيانات.` : `KWD ${demoAmounts[demoAmount]}${demoRating ? ` · ${demoRating}/5 rating` : ''}. Preview only; no payment or data saved.`}</span></div><button type="button" data-testid="button-demo-reset" onClick={() => setDemoComplete(false)}>{ar ? 'جرّب مرة أخرى' : 'Try again'}</button></div> : <>
          <div className="demo-amounts" role="group" aria-label={ar ? 'اختر مبلغاً تجريبياً' : 'Choose a sample tip amount'}>{demoAmounts.map((amount, index) => <button key={amount} type="button" data-testid={`button-demo-amount-${amount.replace('.', '-')}`} className={demoAmount === index ? 'selected' : ''} aria-pressed={demoAmount === index} onClick={() => setDemoAmount(index)}>KWD {amount}</button>)}</div>
          <div className="demo-controls"><div><span>{ar ? 'تقييم اختياري' : 'OPTIONAL RATING'}</span><div className="demo-stars" role="group" aria-label={ar ? 'اختر تقييماً' : 'Choose a rating'}>{[1,2,3,4,5].map((rating) => <button key={rating} type="button" data-testid={`button-demo-rating-${rating}`} aria-label={`${rating} ${ar ? 'نجوم' : rating === 1 ? 'star' : 'stars'}`} aria-pressed={demoRating === rating} onClick={() => setDemoRating(demoRating === rating ? null : rating)}><Star size={17} fill={demoRating && rating <= demoRating ? 'currentColor' : 'none'}/></button>)}</div></div><strong data-testid="text-demo-selected-amount">KWD {demoAmounts[demoAmount]}</strong></div>
          <button type="button" className="demo-submit" data-testid="button-preview-tip-confirmation" onClick={() => setDemoComplete(true)}>{ar ? 'عرض التأكيد التجريبي' : 'Preview confirmation'} <ArrowUpRight size={15}/></button>
          <Link href="/tip/ahmed-almutairi" className="real-tip-link" data-testid="link-real-tip">{ar ? 'أرسل إكرامية حقيقية' : 'Send a real tip'} <ArrowUpRight size={14}/></Link>
        </>}
      </div>
    </section>
    <section id="for-business" className="business-section landing-business landing-reveal"><div className="business-copy"><div className="eyebrow">{ar ? 'للشركات' : 'FOR COMPANIES'}</div><h2>{ar ? <>تقدير أوضح،<br/>لفريقك.</> : <>A clearer way<br/>to value <em>your team.</em></>}</h2><ul><li><BadgeCheck/>{ar ? 'رموز QR شخصية لكل موظف' : 'Personal QR badges for every worker'}</li><li><BadgeCheck/>{ar ? 'سجلات واضحة للإكراميات والرواتب' : 'Clear tip and payroll records'}</li></ul><Link href="/sign-up" className="business-link" data-testid="link-company-signup">{ar ? 'إنشاء حساب شركة' : 'Create a company account'} <ArrowUpRight size={16}/></Link></div>
      <div className="business-panel business-panel-simple company-preview"><div className="panel-topline"><span>{ar ? 'معاينة لوحة الشركة' : 'COMPANY PREVIEW'}</span><span className="preview-tag">{ar ? 'بيانات نموذجية' : 'SAMPLE DATA'}</span></div><div className="company-preview-content"><div className="sample-badge"><span className="sample-badge-brand">سند</span><QrGraphic/><strong>{ar ? 'أحمد المطيري' : 'Ahmed Almutairi'}</strong><small>{ar ? 'موظف خدمة · معاينة' : 'Service team · Preview'}</small></div><div className="sample-dashboard"><span className="sample-dash-title">{ar ? 'نظرة عامة للفريق' : 'TEAM OVERVIEW'} <small>{ar ? 'معاينة' : 'PREVIEW'}</small></span><strong>KWD 84.250</strong><span className="sample-caption">{ar ? 'إكراميات هذا الشهر · بيانات نموذجية' : 'Tips this month · sample only'}</span><div className="sample-bars" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></div><div className="sample-worker"><span className="sample-initials">AM</span><span><b>{ar ? 'أحمد المطيري' : 'Ahmed Almutairi'}</b><small>{ar ? 'رمز شخصي نشط' : 'Personal badge active'}</small></span><Check size={14}/></div></div></div><Link href="/sign-up" className="preview-signup" data-testid="link-company-preview-signup">{ar ? 'ابدأ بإعداد فريقك' : 'Set up your team'} <ArrowUpRight size={14}/></Link></div>
    </section>
    <Footer/>
  </main></LocalizedTree>;
}
function Footer() { return <footer className="footer"><Brand/><span>Made with care in Kuwait.</span><div><Link href="/worker/sign-in">Worker sign in</Link><Link href="/sign-up">For companies</Link><span>© SANAD</span></div></footer>; }
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
      onError: (error) => setNotice(isHttpStatus(error, 422) ? 'KWD payments aren’t available yet. No payment was made.' : isHttpStatus(error, 503) ? 'Live payments aren’t enabled yet. No payment was made.' : isHttpStatus(error, 502) ? 'Stripe checkout is unavailable. No payment was made.' : 'We couldn’t start checkout. Please try again in a moment.'),
    });
  };
  return <LocalizedTree><main className="tip-page"><div className="tip-top"><Brand/><LanguageToggle/></div><div className="tip-card rise">
    {isLoading ? <Skeleton rows={4}/> : isError || !worker ? <ErrorPanel retry={() => { void refetch(); }}/> : <>
      <div className="tip-profile"><Avatar name={worker.name} photo={worker.photoUrl} size="lg"/><span className="tip-brandline">{worker.companyName}</span><h1>{worker.name}</h1>{worker.arabicName && <span className="arabic tip-arabic" dir="rtl">{worker.arabicName}</span>}<p>{worker.role}{worker.branch ? ` · ${worker.branch}` : ''}</p></div>
      <form onSubmit={submit} className="tip-form">
        <label className="form-label">Amount <small>KWD</small></label>
        <div className="amount-options">{[250,500,1000,2000].map((n)=><button data-testid={`button-amount-${n}`} type="button" onClick={()=>{setAmount(n);setCustom('')}} className={`amount-option ${!custom&&amount===n?'chosen':''}`} key={n}>KWD {(n/1000).toFixed(3)}</button>)}</div>
        <label className="custom-amount"><span>Custom amount</span><div><span>KWD</span><input data-testid="input-custom-amount" aria-label="Custom amount in KWD" type="number" min="0.250" max="1000" step="0.001" placeholder="0.000" value={custom} onChange={(e)=>setCustom(e.target.value)}/></div></label>
        <div className="rating-row"><div><strong>Rating (optional)</strong></div><div className="rating-stars">{[1,2,3,4,5].map((n)=><button data-testid={`button-rating-${n}`} aria-label={`${n} stars`} aria-pressed={n<= (rating ?? 0)} type="button" onClick={()=>setRating(rating===n?null:n)} key={n}><Star size={20} fill={n<=(rating ?? 0)?'currentColor':'none'}/></button>)}</div></div>
        <div className="secure-tip"><ShieldCheck size={16}/><span>Secure card payment via Stripe.</span></div>
        {import.meta.env.DEV && <div className="demo-callout" data-testid="text-stripe-test-mode">Test mode · No real payment.</div>}
        {notice && <div className="form-notice" role="alert">{notice}</div>}
        <PillButton type="submit" className="submit-tip" disabled={checkout.isPending}>{checkout.isPending ? 'Opening secure checkout…' : <>Pay {money(amountFils)} <ArrowUpRight size={17}/></>}</PillButton>
      </form>
    </>}
  </div></main></LocalizedTree>;
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
  { href:'/worker', label:'Overview', icon:LayoutDashboard }, { href:'/worker/earnings',label:'Earnings',icon:Wallet },
  { href:'/worker/transactions',label:'Transactions',icon:ArrowDownLeft },{ href:'/worker/payouts',label:'Payouts',icon:Banknote }, { href:'/worker/qr',label:'My QR badge',icon:QrCode },
];
const companyNav = [
  { href:'/company',label:'Overview',icon:LayoutDashboard },{ href:'/company/workers',label:'Workers',icon:Users },
  { href:'/company/qr-badges',label:'QR Badges',icon:QrCode },
  { href:'/company/transactions',label:'Transactions',icon:ArrowDownLeft },{ href:'/company/payouts',label:'Payouts',icon:Banknote },
  { href:'/company/reports',label:'Reports',icon:BarChart3 },
];
function PortalLayout({ children, company = false, title = 'Overview' }: { children: ReactNode; company?: boolean; title?: string }) {
  const { language } = useLanguage();
  const [currentLocation,setLocation] = useLocation();
  const queryClient = useQueryClient();
  const workerAccount = useGetWorkerDashboard({ query: { enabled: !company, queryKey: getGetWorkerDashboardQueryKey() } });
  const workerSession = useGetWorkerAuthSession({ query: { queryKey: getGetWorkerAuthSessionQueryKey(), enabled: !company, retry: false } });
  const workerLogout = useWorkerLogout();
  const companyAccount = useGetCompanyDashboard({ query: { enabled: company, queryKey: getGetCompanyDashboardQueryKey(), retry: false } });
  const companyProfileMissing = company && companyAccount.isError && isHttp404(companyAccount.error);
  const nav = company ? (companyProfileMissing ? companyNav.slice(0,1) : companyNav) : workerNav;
  const [mobileNav,setMobileNav] = useState(false);
  const currentPath = basePath && currentLocation.startsWith(basePath) ? currentLocation.slice(basePath.length) || '/' : currentLocation;
  const accountName = company ? companyAccount.data?.company.name || 'Your company' : workerAccount.data?.worker.name || 'Your account';
  const accountRole = company ? 'Company manager' : workerAccount.data?.worker.role || 'Worker';
  if (companyProfileMissing && currentPath !== '/company') {
    return <Redirect to="/company"/>;
  }
  return <LocalizedTree><div className="portal">
    <aside id="portal-navigation" aria-label={company?'Company navigation':'Worker navigation'} className={`portal-sidebar ${mobileNav?'sidebar-open':''}`}><div className="side-brand"><Brand/><button className="mobile-close" onClick={()=>setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="side-profile"><Avatar name={accountName} size="md"/><div><strong>{accountName}</strong><span>{accountRole}</span></div></div>
      <span className="side-section">{companyProfileMissing?'COMPANY SETUP':company?'MANAGE YOUR TEAM':'YOUR SANAD'}</span><nav className="side-nav">{nav.map((item)=>{const active=currentPath===item.href;const Icon=item.icon;return <Link href={item.href} key={item.href} onClick={()=>setMobileNav(false)} className={`side-link ${active?'active':''}`} aria-current={active?'page':undefined} data-testid={`link-nav-${item.href.split('/').pop()}`}><Icon size={17}/><span>{item.label}</span></Link>})}</nav>
       <div className="sidebar-bottom">{!companyProfileMissing&&<Link href={company?'/company/settings':'/worker/settings'} onClick={()=>setMobileNav(false)} className={`side-link side-secondary ${currentPath===(company?'/company/settings':'/worker/settings')?'active':''}`} data-testid="link-nav-settings"><Settings size={17}/><span>Settings</span></Link>}{!company&&workerSession.data?.authenticated&&<button type="button" className="side-link side-secondary side-link-button" data-testid="button-worker-signout" onClick={()=>workerLogout.mutate(undefined,{onSuccess:()=>{queryClient.clear();setLocation('/worker/sign-in')}})}><LogOut size={17}/><span>Sign out</span></button>}<div className="sidebar-help"><div className="help-icon"><CircleHelp size={17}/></div><strong>Need a hand?</strong><span>We’re here to help.</span><a href="mailto:hello@sanad.kw">Get in touch <ArrowUpRight size={12}/></a></div><span className="side-version">SANAD · KUWAIT</span></div>
    </aside>
    {mobileNav && <button aria-label="Close navigation" className="nav-backdrop" onClick={()=>setMobileNav(false)}/>}
    <div className="portal-main"><header className="portal-header"><button className="mobile-menu" onClick={()=>setMobileNav(true)} aria-label="Open menu" aria-expanded={mobileNav} aria-controls="portal-navigation"><Menu/></button><div><span className="breadcrumb">SANAD <ChevronRight size={12}/> {company?'COMPANY':'WORKER'}</span><h1>{localized(title,language)}</h1></div><div className="portal-header-tools"><LanguageToggle/><div className="top-user">{initials(accountName)}</div></div></header>
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
  return <PortalLayout title="Overview"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{d&&<><div className="metric-grid"><Metric label="Tips received" value={money(d.totalTipsFils)} caption="All time" icon={Wallet} accent/><Metric label="This month" value={money(d.monthTipsFils)} caption="Since the 1st" icon={ArrowUpRight}/><Metric label="Awaiting payout" value={money(d.pendingTipsFils)} caption="Not yet in payroll" icon={Clock3}/><Metric label="Average rating" value={d.averageRating==null?'—':`${d.averageRating.toFixed(1)} / 5`} caption={d.averageRating==null?'No ratings yet':'From your guests'} icon={Star}/></div><section className="surface data-section"><div className="section-heading"><div><h3>Latest tips</h3></div><div className="section-tools"><DemoFlag demo={d.isDemo}/><Link href="/worker/transactions" className="text-link">All transactions <ArrowUpRight size={14}/></Link></div></div><TransactionTable transactions={d.recentTransactions}/></section></>}</QueryState></PortalLayout>;
}
function WorkerTransactions() {
  const q=useListWorkerTransactions({query:{queryKey:getListWorkerTransactionsQueryKey()}});
  return <PortalLayout title="Transactions"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}><section className="surface data-section"><div className="section-heading"><div><h3>Tip history <span className="subtle-count">{q.data?.length ?? 0}</span></h3></div><div className="section-tools"><DemoFlag demo={q.data?.some(x=>x.isDemo)}/><button onClick={()=>downloadCsv(q.data||[],'sanad-worker-transactions.csv')} className="outline-button"><Download size={15}/> Export</button></div></div><TransactionTable transactions={q.data}/></section></QueryState></PortalLayout>;
}
function PayoutList({ payouts, empty, onStatusChange, updatingId }: { payouts?: PayoutRecord[]; empty: string; onStatusChange?: (payout: PayoutRecord) => void; updatingId?: string }) {
  const { language } = useLanguage();
  if(!payouts?.length) return <EmptyPanel title="No payout records yet" text={empty}/>;
  return <LocalizedTree><div className="table-scroll"><table className="data-table"><thead><tr><th>Payroll period</th><th>Recorded</th><th>Amount</th><th>Status</th>{onStatusChange&&<th>Update record</th>}</tr></thead><tbody>{payouts.map((p)=><tr key={p.id}><td><div><b>{monthName(p.month,language)}</b><small>{p.note||'SANAD payout record'}{p.isDemo?' · Demo':''}</small></div></td><td>{dateLabel(p.recordedAt,language)}</td><td className="table-amount">{money(p.amountFils)}</td><td><Badge status={p.status}/></td>{onStatusChange&&<td><button className="outline-button compact" disabled={updatingId===p.id} onClick={()=>onStatusChange(p)}>{updatingId===p.id?'Saving…':p.status==='paid'?'Mark pending':'Mark paid'}</button></td>}</tr>)}</tbody></table></div></LocalizedTree>;
}
function WorkerEarnings() {
  const d=useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  return <PortalLayout title="Earnings"><QueryState loading={d.isLoading} error={d.isError} retry={()=>void d.refetch()}>{d.data&&<><div className="metric-grid metric-grid-three"><Metric label="Total tips" value={money(d.data.totalTipsFils)} caption="All time" icon={Wallet} accent/><Metric label="This month" value={money(d.data.monthTipsFils)} caption="Since the 1st" icon={ArrowUpRight}/><Metric label="Paid out" value={money(d.data.paidTipsFils)} caption="Payroll recorded" icon={Banknote}/></div><section className="surface chart-surface earnings-chart"><TrendChart values={d.data.monthly}/></section></>}</QueryState></PortalLayout>;
}
function WorkerPayouts() {
  const p=useListWorkerPayouts({query:{queryKey:getListWorkerPayoutsQueryKey()}});
  return <PortalLayout title="Payouts"><QueryState loading={p.isLoading} error={p.isError} retry={()=>void p.refetch()}><section className="surface data-section"><div className="section-heading"><h3>Payroll records</h3><DemoFlag demo={p.data?.some(x=>x.isDemo)}/></div><p className="compact-note">Company-entered records · No bank transfer.</p><PayoutList payouts={p.data} empty="Your company’s payroll records will appear here."/></section></QueryState></PortalLayout>;
}
function WorkerQr() {
  const q=useGetWorkerBadge({query:{queryKey:getGetWorkerBadgeQueryKey()}});
  const [copied,setCopied]=useState(false);
  const rawUrl=q.data ? q.data.tippingUrl || `${window.location.origin}${basePath}/tip/${q.data.workerSlug}` : '';
  const url=rawUrl ? baseAwareUrl(rawUrl) : '';
  const copy=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}};
  return <PortalLayout title="My QR Badge"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{q.data&&<div className="qr-page-grid"><section className="surface qr-preview"><div className="badge-company">{q.data.companyName}</div><Avatar name={q.data.workerName} size="md"/><h3>{q.data.workerName}</h3><span>Scan to tip</span><div className="qr-large"><QRCodeSVG className="real-qr" value={url} size={190} level="H" includeMargin fgColor="#3B1720" bgColor="#FFFFFF" title={`SANAD tip QR for ${q.data.workerName}`}/></div><DemoFlag demo={q.data.isDemo}/></section><section className="surface qr-instructions"><div className="panel-kicker">TIP LINK</div><h3>Share your badge</h3><div className="copy-link"><span>{url}</span><button onClick={()=>void copy()} data-testid="button-copy-link">{copied?<Check size={15}/>:<span>Copy</span>}</button></div><PillButton onClick={()=>window.print()} className="download-badge"><Download size={15}/> Print badge</PillButton></section></div>}</QueryState></PortalLayout>;
}
function WorkerSettings() {
  const q=useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  return <PortalLayout title="Settings"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{q.data&&<><div className="welcome-row"><div><div className="eyebrow">Your SANAD profile</div><h2>Your details, kept simple.</h2><p>Profile information is managed by your company.</p></div></div><section className="surface settings-panel"><div className="settings-person"><Avatar name={q.data.worker.name}/><div><h3>{q.data.worker.name}</h3><span>{q.data.worker.role} · {q.data.worker.branch}</span></div><Badge status={q.data.worker.status}/></div><div className="settings-row"><span>Display name</span><strong>{q.data.worker.name}</strong></div><div className="settings-row"><span>Arabic name</span><strong className="arabic">{q.data.worker.arabicName||'—'}</strong></div><div className="settings-row"><span>Phone number</span><strong dir="ltr">{q.data.worker.phoneNumber||'—'}</strong></div><div className="settings-row"><span>Team / branch</span><strong>{q.data.worker.branch||'—'}</strong></div><div className="notice-box"><ShieldCheck size={17}/><span>Need to update something? Ask your company manager to change your profile details.</span></div></section></>}</QueryState></PortalLayout>;
}

function CompanyOnboarding() {
  const create=useCreateCompanyProfile();
  const qc=useQueryClient();
  const [name,setName]=useState('');const [registration,setRegistration]=useState('');const [email,setEmail]=useState('');
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{name,registrationNumber:registration||null,contactEmail:email||null}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()});void qc.invalidateQueries({queryKey:getListCompanyWorkersQueryKey()})}})};
  return <LocalizedTree><div className="onboarding-wrap"><div className="onboarding-story"><div className="onboarding-seal"><BadgeCheck size={22}/></div><div className="eyebrow">COMPANY</div><h2>Set up<br/><em>your company.</em></h2><p>Add company details to create your SANAD workspace.</p></div><form className="surface onboarding-form" onSubmit={submit}><div className="panel-kicker">COMPANY PROFILE</div><h3>Company details</h3><label>Company name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Marina House"/></label><label>Commercial registration number<input maxLength={100} value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="Optional"/></label><label>Contact email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="team@company.com"/></label>{create.isError&&<div className="form-notice" role="alert">Couldn’t set up your company. Check the details and try again.</div>}<PillButton type="submit" disabled={create.isPending}>{create.isPending?'Creating…':'Create workspace'} <ArrowUpRight size={15}/></PillButton><small><ShieldCheck size={13}/> Your company details stay within your workspace.</small></form></div></LocalizedTree>;
}
function CompanyOverview() {
  const q=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey(),retry:false}});
  const notConfigured=q.isError&&isHttp404(q.error);
  return <PortalLayout company title={notConfigured?'Set up your company':'Overview'}><QueryState loading={q.isLoading} error={q.isError&&!notConfigured} retry={()=>void q.refetch()}>{notConfigured?<CompanyOnboarding/>:q.data&&<><div className="overview-actions company-overview-actions"><DemoFlag demo={q.data.isDemo}/><Link href="/company/workers" className="solid-button" data-testid="link-manage-workers"><Users size={15}/> Manage Workers</Link></div><div className="metric-grid metric-grid-three"><Metric label="Tips received" value={money(q.data.totalTipsFils)} caption="Across your team" icon={Wallet} accent/><Metric label="This month" value={money(q.data.monthTipsFils)} caption="All team tips" icon={ArrowUpRight}/><Metric label="Pending payroll" value={money(q.data.pendingTipsFils)} caption="Ready to record" icon={Clock3}/></div><section className="surface data-section"><div className="section-heading"><h3>Recent tips</h3><Link href="/company/transactions" className="text-link">All transactions <ArrowUpRight size={14}/></Link></div><TransactionTable transactions={q.data.recentTransactions}/></section></>}</QueryState></PortalLayout>;
}
function CompanyQrBadges() {
  const q=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
  const { language }=useLanguage();
  const [copied,setCopied]=useState('');
  const badgeWorkers=(q.data||[]).filter(worker=>worker.status==='active');
  const tipUrl=(slug:string)=>baseAwareUrl(`${window.location.origin}${basePath}/tip/${encodeURIComponent(slug)}`);
  const copy=async(workerId:string,url:string)=>{try{await navigator.clipboard.writeText(url);setCopied(workerId);window.setTimeout(()=>setCopied(''),1600)}catch{setCopied('')}};
  return <PortalLayout company title="QR Badges"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{badgeWorkers.length?<section className="surface company-badge-list" aria-label="Worker QR badges"><div className="section-heading company-badge-heading"><h3>Worker badges <span className="subtle-count">{badgeWorkers.length}</span></h3><DemoFlag demo={badgeWorkers.some(worker=>worker.isDemo)}/></div>{badgeWorkers.map(worker=>{const url=tipUrl(worker.slug);return <article className="company-badge-row" key={worker.id} data-testid={`card-worker-qr-${worker.id}`}><QRCodeSVG value={url} size={72} level="M" includeMargin fgColor="#3B1720" bgColor="#FAF4EC" title={`SANAD tip QR for ${worker.name}`}/><div className="company-badge-person"><strong>{worker.name}</strong><span>{worker.role}{worker.branch?` · ${worker.branch}`:''}</span><code dir="ltr">{url}</code></div><div className="company-badge-actions"><button className="outline-button compact" type="button" onClick={()=>void copy(worker.id,url)} data-testid={`button-copy-worker-tip-${worker.id}`}>{copied===worker.id?<Check size={13}/>:<Copy size={13}/>} {copied===worker.id?(language==='ar'?'تم النسخ':'Copied'):(language==='ar'?'نسخ الرابط':'Copy link')}</button><a className="outline-button compact" href={url} target="_blank" rel="noreferrer" data-testid={`link-open-worker-tip-${worker.id}`}>{language==='ar'?'فتح الرابط':'Open tip page'} <ArrowUpRight size={13}/></a></div></article>})}</section>:<EmptyPanel title="No active worker badges" text="Activate a worker to show their QR code."/>}</QueryState></PortalLayout>;
}
function CompanyWorkers() {
  const { language }=useLanguage();
  const q=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
  const create=useCreateCompanyWorker();
  const update=useUpdateCompanyWorker();
  const resetPassword=useIssueWorkerTemporaryPassword();
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);
  const [name,setName]=useState('');const [arabic,setArabic]=useState('');const [phoneNumber,setPhoneNumber]=useState('');const [role,setRole]=useState('');const [branch,setBranch]=useState('');
  const [credentialWorker,setCredentialWorker]=useState('');const [temporaryPassword,setTemporaryPassword]=useState('');const [passwordCopied,setPasswordCopied]=useState(false);
  const [filter,setFilter]=useState('');
  const refresh=()=>qc.invalidateQueries({queryKey:getListCompanyWorkersQueryKey()});
  const closeModal=()=>{setOpen(false);setTemporaryPassword('');setCredentialWorker('');setPasswordCopied(false);setPhoneNumber('')};
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{name,arabicName:arabic||null,phoneNumber,role,branch:branch||null}},{onSuccess:(result)=>{void refresh();setCredentialWorker(result.worker.name);setTemporaryPassword(result.temporaryPassword);setName('');setArabic('');setPhoneNumber('');setRole('');setBranch('')}})};
  const reset=(worker:{id:string;name:string})=>{const prompt=language==='ar'?`إصدار كلمة مرور مؤقتة جديدة لـ ${worker.name}؟ سيؤدي ذلك إلى إنهاء الجلسات الحالية.`:`Issue a new temporary password for ${worker.name}? This will end their current sessions.`;if(!window.confirm(prompt))return;resetPassword.mutate({workerId:worker.id},{onSuccess:(result)=>{setCredentialWorker(worker.name);setTemporaryPassword(result.temporaryPassword);setOpen(true)}})};
  const copyPassword=async()=>{try{await navigator.clipboard.writeText(temporaryPassword);setPasswordCopied(true);window.setTimeout(()=>setPasswordCopied(false),1800)}catch{setPasswordCopied(false)}};
  const visible=(q.data||[]).filter(w=>`${w.name} ${w.phoneNumber||''} ${w.role} ${w.branch||''}`.toLowerCase().includes(filter.toLowerCase()));
  return <PortalLayout company title="Workers"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{resetPassword.isError&&<div className="form-notice" role="alert">Couldn’t issue a new temporary password. Try again.</div>}<section className="surface data-section"><div className="section-heading"><div><h3>Team <span className="subtle-count">{visible.length}</span></h3></div><div className="section-tools"><div className="searchbox"><Search size={15}/><input data-testid="input-worker-search" placeholder="Search workers" value={filter} onChange={e=>setFilter(e.target.value)}/></div><button className="solid-button" onClick={()=>{setTemporaryPassword('');setCredentialWorker('');setOpen(true)}}><Users size={15}/> Add worker</button></div></div>{visible.length? <div className="table-scroll"><table className="data-table"><thead><tr><th>Worker</th><th>Role & branch</th><th>Tips received</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map((w)=><tr key={w.id}><td><div className="table-person"><Avatar name={w.name} size="sm"/><span><b>{w.name}</b><small dir="ltr">{w.phoneNumber||'No phone number'}</small></span></div></td><td><div><b>{w.role}</b><small>{w.branch||'No branch'}</small></div></td><td className="table-amount">{money(w.totalTipsFils)}</td><td><Badge status={w.status}/></td><td><div className="worker-row-actions">{w.status==='active'&&<button className="outline-button compact" disabled={resetPassword.isPending} onClick={()=>reset({id:w.id,name:w.name})}>Reset password</button>}<button className="outline-button compact" disabled={update.isPending} onClick={()=>update.mutate({workerId:w.id,data:{status:w.status==='active'?'inactive':'active'}},{onSuccess:()=>void refresh()})}>{w.status==='active'?'Pause':'Activate'}</button></div></td></tr>)}</tbody></table></div>:<EmptyPanel title="No team members found" text="Try another name or add your first worker."/>}</section></QueryState>{open&&<div className="modal-backdrop" role="presentation"><div className="modal-card"><button type="button" className="modal-close" onClick={closeModal} aria-label="Close"><X size={17}/></button>{temporaryPassword?<><div className="eyebrow">WORKER LOGIN</div><h2>{language==='ar'?`بيانات دخول ${credentialWorker}`:`Share with ${credentialWorker}`}</h2><p>Give this temporary password to the worker directly. It is shown only once.</p><div className="temporary-password" dir="ltr"><code>{temporaryPassword}</code><button type="button" className="outline-button compact" onClick={()=>void copyPassword()}>{passwordCopied?<Check size={14}/>:<Copy size={14}/>} {passwordCopied?'Copied':'Copy'}</button></div><div className="notice-box"><KeyRound size={16}/><span>The worker signs in with their phone number and changes this password at first sign-in.</span></div><PillButton type="button" onClick={closeModal}>Done <Check size={15}/></PillButton></>:<form onSubmit={submit}><div className="eyebrow">ADD WORKER</div><h2>Add worker</h2><label>Full name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Faisal Al-Rashid"/></label><label>Arabic name <input dir="rtl" value={arabic} onChange={e=>setArabic(e.target.value)} placeholder="الاسم بالعربية"/></label><label>Phone number<input required type="tel" autoComplete="tel" dir="ltr" value={phoneNumber} onChange={e=>setPhoneNumber(e.target.value)} placeholder="+965 5000 0000"/></label><div className="modal-split"><label>Role<input required value={role} onChange={e=>setRole(e.target.value)} placeholder="Barista"/></label><label>Branch<input value={branch} onChange={e=>setBranch(e.target.value)} placeholder="Salmiya"/></label></div>{create.isError&&<div className="form-notice" role="alert">Couldn’t add this worker. Check the phone number and try again.</div>}<PillButton type="submit" disabled={create.isPending}>{create.isPending?'Adding…':'Add worker'} <ArrowUpRight size={15}/></PillButton></form>}</div></div>}</PortalLayout>;
}
function CompanyTransactions() {
  const q=useListCompanyTransactions({query:{queryKey:getListCompanyTransactionsQueryKey()}});
  const [search,setSearch]=useState('');
  const data=(q.data||[]).filter(t=>t.workerName.toLowerCase().includes(search.toLowerCase()));
  return <PortalLayout company title="Transactions"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}><section className="surface data-section"><div className="section-heading"><h3>Tip history <span className="subtle-count">{data.length}</span></h3><div className="section-tools"><DemoFlag demo={q.data?.some(t=>t.isDemo)}/><div className="searchbox"><Search size={15}/><input placeholder="Search workers" value={search} onChange={e=>setSearch(e.target.value)}/></div><button onClick={()=>downloadCsv(data,'sanad-company-transactions.csv')} className="outline-button"><Download size={15}/> Export</button></div></div><TransactionTable transactions={data}/></section></QueryState></PortalLayout>;
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
  return <PortalLayout company title="Payouts"><QueryState loading={q.isLoading||workers.isLoading} error={q.isError||workers.isError} retry={()=>{void q.refetch();void workers.refetch()}}><div className="payout-toolbar"><span className="compact-note"><ShieldCheck size={15}/> Payroll records only · SANAD does not send bank transfers.</span><button className="solid-button" onClick={()=>setOpen(true)}><Banknote size={15}/> Record payout</button></div>{updateStatus.isError&&<div className="form-notice" role="alert">Could not update this payroll record. Please try again.</div>}<section className="surface data-section"><div className="section-heading"><h3>Payout history <span className="subtle-count">{q.data?.length??0}</span></h3><DemoFlag demo={q.data?.some(x=>x.isDemo)}/></div><PayoutList payouts={q.data} empty="Recorded payouts will appear here." onStatusChange={changeStatus} updatingId={updateStatus.isPending ? updateStatus.variables?.payoutId : undefined}/></section></QueryState>{open&&<div className="modal-backdrop"><form className="modal-card" onSubmit={submit}><button type="button" className="modal-close" onClick={()=>setOpen(false)} aria-label="Close"><X size={17}/></button><div className="eyebrow">PAYROLL RECORD</div><h2>Record a payout</h2><p>Record a payroll payment already handled by your company.</p><label>Worker<select required value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Select a worker</option>{workers.data?.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select></label><div className="modal-split"><label>Amount in KWD<input required type="number" min="0.001" step="0.001" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.000"/></label><label>Payroll month<input required type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div><label>Note (optional)<textarea maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional reference for this payroll record"/></label>{create.isError&&<div className="form-notice">Could not save payout. Please try again.</div>}<PillButton type="submit" disabled={create.isPending||!workerId}>{create.isPending?'Saving…':'Save payout record'} <ArrowUpRight size={15}/></PillButton></form></div>}</PortalLayout>;
}
function CompanyReports() {
  const { language } = useLanguage();
  const monthState=useState(kuwaitMonth);
  const [month,setMonth]=monthState;
  const q=useGetCompanyReport({month},{query:{queryKey:getGetCompanyReportQueryKey({month}),enabled:!!month}});
  return <PortalLayout company title="Reports"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{q.data&&<section className="surface report-panel"><div className="report-title"><div className="report-icon"><FileText/></div><div><span className="panel-kicker">MONTHLY REPORT</span><h3>{monthName(q.data.month,language)}</h3></div><label className="month-picker"><span>Month</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><DemoFlag demo={q.data.isDemo}/></div><div className="report-rows"><div><span>Total tips</span><strong>{money(q.data.tipsFils)}</strong></div><div><span>Pending payroll</span><strong>{money(q.data.pendingFils)}</strong></div><div><span>Paid out</span><strong>{money(q.data.paidOutFils)}</strong></div><div><span>Workers</span><strong>{q.data.workerCount}</strong></div><div><span>Transactions</span><strong>{q.data.transactionCount}</strong></div></div><button className="outline-button" onClick={()=>downloadCsv([{month:monthName(q.data!.month),tips:money(q.data!.tipsFils),pending:money(q.data!.pendingFils),paidOut:money(q.data!.paidOutFils),workers:q.data!.workerCount,transactions:q.data!.transactionCount}],'sanad-monthly-report.csv')}><Download size={15}/> Download report</button></section>}</QueryState></PortalLayout>;
}
function CompanySettings() {
  const { signOut }=useClerk();
  const q=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey(),retry:false}});
  const create=useCreateCompanyProfile();
  const qc=useQueryClient();
  const [name,setName]=useState('');const [registration,setRegistration]=useState('');const [email,setEmail]=useState('');const [saved,setSaved]=useState(false);
  useEffect(()=>{if(q.data){setName(q.data.company.name);setRegistration(q.data.company.registrationNumber||'');setEmail(q.data.company.contactEmail||'')}},[q.data]);
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{name,registrationNumber:registration||null,contactEmail:email||null}},{onSuccess:()=>{setSaved(true);void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()})}})};
  const notConfigured=q.isError&&isHttp404(q.error);
  return <PortalLayout company title={notConfigured?'Set up your company':'Settings'}><QueryState loading={q.isLoading} error={q.isError&&!notConfigured} retry={()=>void q.refetch()}>{notConfigured?<CompanyOnboarding/>:q.data&&<form className="surface settings-form" onSubmit={submit}><div className="panel-kicker">COMPANY PROFILE</div><h3>Company details</h3><label>Company name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label>Commercial registration number<input maxLength={100} value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="Optional"/></label><label>Contact email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="team@company.com"/></label><div className="notice-box"><ShieldCheck size={17}/><span>Your team’s records are private to your company account.</span></div>{create.isError&&<div className="form-notice">Couldn’t save the profile. Try again.</div>}{saved&&<div className="success-notice"><Check size={15}/> Saved.</div>}<PillButton type="submit" disabled={create.isPending}>{create.isPending?'Saving…':'Save changes'} <ArrowUpRight size={15}/></PillButton><DemoFlag demo={q.data.isDemo}/><div className="company-settings-logout"><button type="button" className="outline-button" data-testid="button-company-signout" onClick={()=>void signOut({redirectUrl:basePath||'/'})}><LogOut size={15}/> Sign out</button></div></form>}</QueryState></PortalLayout>;
}
function AuthPage({ signup=false }: { signup?:boolean }) {
  return <LocalizedTree><main className="auth-page"><div className="auth-brand"><Brand/><LanguageToggle/></div><div className="auth-copy"><div className="eyebrow">A better way to say thank you</div><h1>Good service<br/><em>deserves a SANAD.</em></h1><p>Simple, thoughtful, and here when you need it.</p></div><div className="auth-clerk">{signup?<SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/continue`}/>:<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/continue`}/>}</div>{!signup&&<Link className="auth-worker-link" href="/worker/sign-in">Worker? Sign in with phone and password</Link>}<div className="auth-footer"><Brand/><span>Made with care in Kuwait.</span></div></main></LocalizedTree>;
}
function WorkerSignInPage() {
  const { language } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const session = useGetWorkerAuthSession({ query: { queryKey: getGetWorkerAuthSessionQueryKey(), retry: false, enabled: isLoaded && !isSignedIn } });
  const login = useWorkerLogin();
  const changePassword = useChangeWorkerPassword();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const needsPasswordChange = session.data?.passwordChangeRequired === true;
  useEffect(() => {
    if (isLoaded && isSignedIn) setLocation('/continue');
    else if (session.data?.authenticated && !session.data.passwordChangeRequired) setLocation('/worker');
  }, [isLoaded, isSignedIn, session.data, setLocation]);
  const signIn = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    login.mutate({ data: { phoneNumber, password } }, {
      onSuccess: (result) => {
        void queryClient.invalidateQueries({ queryKey: getGetWorkerAuthSessionQueryKey() });
        if (!result.passwordChangeRequired) setLocation('/worker');
      },
    });
  };
  const submitPasswordChange = (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (newPassword !== confirmPassword) {
      setFormError(language === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }
    changePassword.mutate({ data: { newPassword } }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetWorkerAuthSessionQueryKey() });
        setLocation('/worker');
      },
    });
  };
  if (!isLoaded || (!isSignedIn && session.isLoading)) return <main className="worker-auth-page"><Skeleton rows={3}/></main>;
  if (isSignedIn) return <Redirect to="/continue"/>;
  if (session.data?.authenticated && !needsPasswordChange) return <Redirect to="/worker"/>;
  const ar = language === 'ar';
  return <LocalizedTree><main className="worker-auth-page"><div className="auth-brand"><Brand/><LanguageToggle/></div><section className="worker-auth-card"><div className="worker-auth-icon">{needsPasswordChange?<KeyRound size={19}/>:<Phone size={19}/>}</div><span className="eyebrow">{ar?'حساب الموظف':'WORKER ACCOUNT'}</span><h1>{needsPasswordChange?(ar?'أنشئ كلمة مرور جديدة':'Create a new password'):(ar?'دخول الموظفين':'Worker sign in')}</h1><p>{needsPasswordChange?(ar?'غيّر كلمة المرور المؤقتة للمتابعة.':'Change your temporary password to continue.'):(ar?'أدخل رقم هاتفك وكلمة مرورك.':'Sign in with your phone number and password.')}</p>{needsPasswordChange&&session.data?.workerName&&<div className="worker-auth-name">{session.data.workerName}</div>}
    {needsPasswordChange?<form onSubmit={submitPasswordChange} className="worker-auth-form"><label>{ar?'كلمة المرور الجديدة':'New password'}<input required type="password" minLength={12} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>{ar?'تأكيد كلمة المرور':'Confirm password'}<input required type="password" minLength={12} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label><small>{ar?'12 حرفاً على الأقل.':'Use at least 12 characters.'}</small>{(formError||changePassword.isError)&&<div className="form-notice" role="alert">{formError||(ar?'تعذر تحديث كلمة المرور. حاول مجدداً.':'Could not update your password. Try again.')}</div>}<button className="solid-button worker-auth-submit" type="submit" disabled={changePassword.isPending}>{changePassword.isPending?(ar?'جارٍ الحفظ…':'Saving…'):(ar?'حفظ كلمة المرور':'Save password')} <ArrowUpRight size={15}/></button></form>
    :<form onSubmit={signIn} className="worker-auth-form"><label>{ar?'رقم الهاتف':'Phone number'}<input required type="tel" autoComplete="tel" value={phoneNumber} onChange={e=>setPhoneNumber(e.target.value)} placeholder="+965 5000 0000" dir="ltr"/></label><label>{ar?'كلمة المرور':'Password'}<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{(formError||login.isError)&&<div className="form-notice" role="alert">{formError||(ar?'رقم الهاتف أو كلمة المرور غير صحيحة.':'Phone number or password is incorrect.')}</div>}<button className="solid-button worker-auth-submit" type="submit" disabled={login.isPending}>{login.isPending?(ar?'جارٍ الدخول…':'Signing in…'):(ar?'دخول':'Sign in')} <LogIn size={15}/></button></form>}
    <div className="worker-auth-links"><Link href="/sign-in">{ar?'دخول البريد أو الشركات':'Email or company sign in'}</Link><Link href="/">{ar?'العودة إلى سند':'Back to SANAD'}</Link></div>
  </section><footer className="worker-auth-footer"><Brand/><span>Made with care in Kuwait.</span></footer></main></LocalizedTree>;
}
function SignedInHome() {
  const worker = useGetWorkerDashboard({ query: { queryKey: getGetWorkerDashboardQueryKey(), retry: false } });
  if (worker.isLoading) return <main className="home-routing"><Skeleton rows={4}/></main>;
  return <Redirect to={worker.data ? '/worker' : '/company'}/>;
}
function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/sign-in"/></Show></>;
}
function WorkerProtected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const session = useGetWorkerAuthSession({ query: { queryKey: getGetWorkerAuthSessionQueryKey(), retry: false, enabled: isLoaded && !isSignedIn } });
  if (!isLoaded || (!isSignedIn && session.isLoading)) return <main className="home-routing"><Skeleton rows={4}/></main>;
  if (isSignedIn) return <Protected>{children}</Protected>;
  if (session.data?.authenticated && !session.data.passwordChangeRequired) return <>{children}</>;
  return <Redirect to="/worker/sign-in"/>;
}
function AuthRoutes() {
  const [,setLocation]=useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{signIn:{start:{title:'Welcome back',subtitle:'Sign in to your SANAD account'}},signUp:{start:{title:'Join SANAD',subtitle:'Bring a little more appreciation to your team'}}}} routerPush={(to)=>setLocation(stripBase(to))} routerReplace={(to)=>setLocation(stripBase(to),{replace:true})}>
    <Switch>
      <Route path="/" component={Landing}/>
      <Route path="/continue" component={()=> <Protected><SignedInHome/></Protected>}/>
      <Route path="/worker/sign-in" component={WorkerSignInPage}/>
      <Route path="/sign-in/*?" component={()=> <AuthPage/>}/>
      <Route path="/sign-up/*?" component={()=> <AuthPage signup/>}/>
      <Route path="/tip/:slug" component={TipPage}/>
      <Route path="/tip-confirmation" component={ConfirmationPage}/>
      <Route path="/worker" component={()=> <WorkerProtected><WorkerOverview/></WorkerProtected>}/>
      <Route path="/worker/transactions" component={()=> <WorkerProtected><WorkerTransactions/></WorkerProtected>}/>
      <Route path="/worker/earnings" component={()=> <WorkerProtected><WorkerEarnings/></WorkerProtected>}/>
      <Route path="/worker/payouts" component={()=> <WorkerProtected><WorkerPayouts/></WorkerProtected>}/>
      <Route path="/worker/qr" component={()=> <WorkerProtected><WorkerQr/></WorkerProtected>}/>
      <Route path="/worker/settings" component={()=> <WorkerProtected><WorkerSettings/></WorkerProtected>}/>
      <Route path="/company" component={()=> <Protected><CompanyOverview/></Protected>}/>
      <Route path="/company/workers" component={()=> <Protected><CompanyWorkers/></Protected>}/>
      <Route path="/company/qr-badges" component={()=> <Protected><CompanyQrBadges/></Protected>}/>
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
