import { useEffect, useLayoutEffect, useState, useRef, createContext, useContext, Children, cloneElement, isValidElement, type ReactNode, type FormEvent, type ChangeEvent } from 'react';
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
  useGetPublicWorker, getGetPublicWorkerQueryKey, useCreateTipQuote, useCreateTipCheckout, useSimulateTip, useGetTipStatus,
  getGetTipStatusQueryKey, useGetWorkerDashboard, getGetWorkerDashboardQueryKey,
  useListWorkerTransactions, getListWorkerTransactionsQueryKey, useListWorkerPayouts,
  getListWorkerPayoutsQueryKey, useGetWorkerBadge, getGetWorkerBadgeQueryKey,
  useCreateCompanyProfile, useGetCompanyDashboard, getGetCompanyDashboardQueryKey,
  useListCompanyWorkers, getListCompanyWorkersQueryKey, useCreateCompanyWorker,
  useUpdateCompanyWorker, useListCompanyTransactions, getListCompanyTransactionsQueryKey,
  useListCompanyPayouts, getListCompanyPayoutsQueryKey, useCreateCompanyPayout,
  useUpdateCompanyPayoutStatus, useGetCompanyReport, getGetCompanyReportQueryKey,
  useWorkerLogin, useGetWorkerAuthSession, getGetWorkerAuthSessionQueryKey,
  useChangeWorkerPassword, useWorkerLogout, useIssueWorkerTemporaryPassword,
  uploadWorkerProfilePhoto, uploadCompanyWorkerPhoto
} from '@workspace/api-client-react';
import type { PayoutRecord, TipTransaction, TipQuote, TipCheckoutResponse } from '@workspace/api-client-react';
import { MAX_TIP_AMOUNT_FILS, MIN_TIP_AMOUNT_FILS, parseKwdAmount } from './lib/tipAmount';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const stripeTestCheckoutEnabled =
  import.meta.env.DEV ||
  import.meta.env.VITE_STRIPE_TEST_CHECKOUT_ENABLED === 'true';
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
const usdMoney = (cents = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
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
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
function getSessionValue(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function setSessionValue(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Tip IDs remain in the URL for checkout confirmation when storage is unavailable.
  }
}
function removeSessionValue(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage is optional; the next interaction can start with a fresh request ID.
  }
}
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
  'Secure checkout · No account needed':'دفع آمن · لا حاجة إلى حساب',
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
  'SECURITY':'الأمان','Change password':'تغيير كلمة المرور','Current password':'كلمة المرور الحالية','New password':'كلمة المرور الجديدة','Confirm new password':'تأكيد كلمة المرور الجديدة','Use at least 12 characters.':'استخدم 12 حرفاً على الأقل.','Passwords do not match.':'كلمتا المرور غير متطابقتين.','Could not update your password. Check your current password and try again.':'تعذر تحديث كلمة المرور. تحقق من كلمة المرور الحالية وحاول مجدداً.','Password updated.':'تم تحديث كلمة المرور.','Update password':'تحديث كلمة المرور','Updating…':'جارٍ التحديث…',
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
  'Record payout':'تسجيل دفعة','Record a payout':'تسجيل دفعة','Marking a record paid means your employer recorded it in payroll. SANAD does not initiate or verify a bank transfer.':'تعني حالة «مدفوع» أن صاحب العمل سجّلها ضمن الرواتب. لا يبدأ سند تحويلاً بنكياً ولا يتحقق منه.',
  'PAYROLL RECORDS':'سجلات الرواتب','Update record':'تحديث السجل','Payroll period':'فترة الرواتب','Recorded':'تاريخ التسجيل',
  'Guest / transaction':'الضيف / المعاملة','Amount received':'المبلغ المستلم','Date received':'تاريخ الاستلام','Rating':'التقييم','Action':'الإجراء',
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
  'Barista':'باريستا','Service host':'موظف خدمة','Salmiya':'السالمية',
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
  'Recipient':'المستلم','Worker tip':'إكرامية الموظف','Stripe checkout':'دفع Stripe',
  'STRIPE TEST CHECKOUT':'دفع Stripe التجريبي','SANAD worker':'موظف سند',
  'DEMO — this status does not represent a real charge.':'عرض تجريبي — هذه الحالة لا تمثل عملية دفع حقيقية.',
  'Back to SANAD':'العودة إلى سند','Return to SANAD':'العودة إلى سند',
  'We couldn’t verify the payment status.':'تعذر التحقق من حالة الدفع.','Check again':'تحقق مجدداً',
};
function localized(text: string, language: Language) {
  if (language !== 'ar') return text;
  const trimmed = text.trim();
  const translated = arabicCopy[trimmed];
  return translated ? text.replace(trimmed, translated) : text;
}
function translateTree(children: ReactNode, language: Language): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') return localized(child, language);
    if (!isValidElement<{ children?: ReactNode; placeholder?: string; title?: string; 'aria-label'?: string }>(child)) return child;
    const props = child.props;
    const translatedProps = {
      ...(props.placeholder ? { placeholder: localized(props.placeholder, language) } : {}),
      ...(props.title ? { title: localized(props.title, language) } : {}),
      ...(props['aria-label'] ? { 'aria-label': localized(props['aria-label'], language) } : {}),
    };
    return props.children == null
      ? cloneElement(child, translatedProps)
      : cloneElement(child, translatedProps, translateTree(props.children, language));
  });
}
function LocalizedTree({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  if (language !== 'ar') return <>{children}</>;
  try {
    return <>{translateTree(children, language)}</>;
  } catch {
    // A translation traversal issue must not blank an otherwise usable page.
    return <>{children}</>;
  }
}

function LanguageToggle() {
  const { language, toggle } = useLanguage();
  return <button data-testid="button-language" className="language-toggle" onClick={toggle} aria-label={language === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}><Globe2 size={15}/><span>{language === 'en' ? 'العربية' : 'English'}</span></button>;
}
function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} data-testid="link-brand"><span className="brand-mark"><Handshake aria-hidden="true" strokeWidth={2.1}/></span><span>SANAD<span className="brand-dot">.</span></span></Link>;
}
function DemoFlag({ demo }: { demo?: boolean }) {
  const { language } = useLanguage();
  return demo ? <span className="demo-flag"><Sparkles size={12}/> {language==='ar'?'بيانات تجريبية':'DEMO DATA'}</span> : null;
}
function Avatar({ name, photo, size = 'md' }: { name: string; photo?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const className = `avatar avatar-${size}`;
  if (photo && failedPhoto !== photo) {
    return <img className={className} src={photo} alt={name} onError={() => setFailedPhoto(photo)}/>;
  }
  return <span className={className} aria-label={name}>{initials(name)}</span>;
}
async function prepareWorkerPhotoUpload(file: File): Promise<File> {
  const maxRequestBytes = 4 * 1024 * 1024;
  if (file.size <= maxRequestBytes) return file;

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image could not be decoded.'));
      element.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('Image dimensions are invalid.');
    }

    for (const maxDimension of [1800, 1400, 1100, 850]) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.88, 0.78, 0.68, 0.58]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob || blob.type !== 'image/webp') continue;
        if (blob.size <= maxRequestBytes) {
          return new File([blob], 'worker-profile.webp', {
            type: 'image/webp',
            lastModified: Date.now(),
          });
        }
      }
    }
    throw new Error('Image could not be reduced to the upload limit.');
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
function WorkerPhotoEditor({
  workerId, name, photoUrl, companyManaged = false, compact = false, onSaved,
}: {
  workerId: string;
  name: string;
  photoUrl?: string | null;
  companyManaged?: boolean;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const { language } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const ar = language === 'ar';

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const candidate = event.target.files?.[0] ?? null;
    event.target.value = '';
    setError('');
    setSaved(false);
    if (!candidate) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type)) {
      setError(ar ? 'اختر صورة JPG أو PNG أو WebP.' : 'Choose a JPG, PNG, or WebP image.');
      setFile(null);
      return;
    }
    if (candidate.size > 5 * 1024 * 1024) {
      setError(ar ? 'يجب ألا يتجاوز حجم الصورة ٥ ميغابايت.' : 'The photo must be 5 MB or smaller.');
      setFile(null);
      return;
    }
    setFile(candidate);
  };

  const savePhoto = async () => {
    if (!file || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const uploadFile = await prepareWorkerPhotoUpload(file);
      if (companyManaged) {
        await uploadCompanyWorkerPhoto(workerId, uploadFile, {
          headers: { 'Content-Type': uploadFile.type },
        });
      } else {
        await uploadWorkerProfilePhoto(uploadFile, {
          headers: { 'Content-Type': uploadFile.type },
        });
      }
      setFile(null);
      setSaved(true);
      onSaved?.();
    } catch {
      setError(ar ? 'تعذر حفظ الصورة. حاول مرة أخرى.' : 'Could not save the photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return <div className={`worker-photo-editor${compact ? ' compact' : ''}`}>
    <Avatar name={name} photo={previewUrl || photoUrl} size={compact ? 'sm' : 'lg'}/>
    <div className="worker-photo-controls">
      {!compact && <div className="worker-photo-copy"><strong>{ar ? 'الصورة الشخصية' : 'Profile photo'}</strong><span>{ar ? 'تظهر على ملفك وصفحة الإكرامية العامة.' : 'Shown on your worker profile and public tipping page.'}</span></div>}
      <input ref={inputRef} className="worker-photo-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={selectPhoto} aria-label={ar ? 'اختر صورة شخصية' : 'Choose a profile photo'}/>
      <div className="worker-photo-actions">
        <button type="button" className="outline-button compact" onClick={() => inputRef.current?.click()} disabled={saving}>{ar ? 'اختيار صورة' : file || photoUrl ? 'Choose another photo' : 'Choose photo'}</button>
        {file && <button type="button" className="solid-button compact" onClick={() => void savePhoto()} disabled={saving}>{saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ الصورة' : 'Save photo')}</button>}
      </div>
      {file && <span className="worker-photo-preview-note" role="status">{ar ? 'معاينة قبل الحفظ' : 'Previewing — save to apply this photo'}</span>}
      {error && <span className="worker-photo-error" role="alert">{error}</span>}
      {saved && <span className="worker-photo-success" role="status">{ar ? 'تم حفظ الصورة.' : 'Photo saved.'}</span>}
    </div>
  </div>;
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
  return <header className="site-header"><Brand/><nav className="public-nav"><a href="#how-it-works" data-testid="link-nav-how">{language === 'ar' ? 'كيف يعمل' : 'How it works'}</a><a href="#for-business" data-testid="link-nav-business">{language === 'ar' ? 'للشركات' : 'For companies'}</a><a href="#for-workers" data-testid="link-nav-workers">{language === 'ar' ? 'للموظفين' : 'For workers'}</a></nav><div className="header-actions"><LanguageToggle/><Link className="header-worker-signin" href="/worker/sign-in" aria-label={language === 'ar' ? 'تسجيل دخول الموظف' : 'Worker sign in'} data-testid="link-sign-in"><LogIn size={14}/><span className="worker-signin-full">{language === 'ar' ? 'دخول الموظف' : 'Worker sign in'}</span><span className="worker-signin-compact">{language === 'ar' ? 'موظف' : 'Worker'}</span></Link><Link className="header-signup" href="/sign-in" data-testid="link-get-started">{language === 'ar' ? 'تسجيل دخول الشركة' : 'Company sign in'} <ArrowUpRight size={15}/></Link></div></header>;
}
function Landing() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const publicDemo = import.meta.env.PROD;
  const publicTestCheckout = publicDemo && stripeTestCheckoutEnabled;
  const [demoAmount, setDemoAmount] = useState(1);
  const [demoRating, setDemoRating] = useState<number | null>(null);
  const [demoComplete, setDemoComplete] = useState(false);
  const demoAmounts = ['0.500', '1.000', '2.000'];
  return <LocalizedTree><main className="landing">
    <Header/>
    <section className="hero-wrap landing-compact">
      <div className="hero-copy landing-hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> {ar ? 'الكويت · إكراميات رقمية' : 'KUWAIT · DIGITAL TIPPING'}</div>
        <h1>{ar ? <>شكراً،<br/><em>بطريقة أسهل.</em></> : <>A simple way<br/>to say <em>thank you.</em></>}</h1>
        <p>{ar ? <>يقدم الضيوف الإكراميات لموظفي الخدمة في الكويت عبر رموز QR الشخصية، بينما تدير الشركات الفرق <span className="keep-together">وسجلات الإكراميات والرواتب.</span></> : <>Guests tip service workers in Kuwait through personal QR codes, while companies manage teams, tip activity, <span className="keep-together">and payroll records.</span></>}</p>
        <div className="hero-actions"><Link href="/sign-up" className="cta-primary" data-testid="link-company-signup-hero">{ar ? 'للشركات' : 'For Companies'} <ArrowUpRight size={17}/></Link><a href="#for-workers" className="cta-quiet" data-testid="link-worker-section-hero">{ar ? 'للموظفين' : 'For Workers'} <ChevronRight size={16}/></a></div>
        <div className="trust-note"><ShieldCheck size={16}/><span>{publicDemo ? publicTestCheckout ? (ar ? 'وضع Stripe التجريبي · لا توجد رسوم حقيقية' : 'Stripe test mode · no real charge') : (ar ? 'عرض عام · جرّب محاكاة إكرامية' : 'Public demo · try a simulated tip') : (ar ? 'دفع آمن · لا حاجة لإنشاء حساب' : 'Secure checkout · No account needed')}</span></div>
      </div>
      <div className="hero-art rise landing-mark-art" aria-hidden="true"><div className="art-sun"/><div className="landing-mark"><Handshake className="landing-handshake" strokeWidth={1.45}/></div><div className="hero-caption"><span>SANAD · سند</span><span>KUWAIT</span></div><div className="sadu art-pattern"/></div>
    </section>
    <section id="how-it-works" className="how-section landing-reveal" aria-labelledby="how-title">
      <div className="how-heading"><span className="eyebrow">{ar ? 'بكل بساطة' : 'THOUGHTFULLY SIMPLE'}</span><h2 id="how-title">{ar ? 'ثلاث خطوات، ويصل شكرك.' : 'Three steps. A thank you delivered.'}</h2></div>
      <div className="how-steps">
        <article className="how-step"><span className="how-icon"><Users size={21}/></span><small>01</small><h3>{ar ? 'أضف الموظفين' : 'Company adds workers'}</h3><p>{ar ? 'تضيف الشركة فريقها إلى سند.' : 'The company adds its team to SANAD.'}</p></article>
        <article className="how-step"><span className="how-icon"><QrCode size={21}/></span><small>02</small><h3>{ar ? 'استلم رمزك' : 'Worker gets a QR'}</h3><p>{ar ? 'يحصل كل موظف على رمز QR شخصي.' : 'Each worker gets a personal QR badge.'}</p></article>
          <article className="how-step"><span className="how-icon"><Heart size={21}/></span><small>03</small><h3>{ar ? 'امسح وأرسل إكرامية' : 'Guest scans and tips'}</h3><p>{ar ? 'يمسح الضيف الرمز ويرسل إكرامية للموظف.' : 'A guest scans the code and sends the worker a tip.'}</p></article>
      </div>
    </section>
    <section id="for-business" className="business-section landing-business landing-reveal"><div className="business-copy"><div className="eyebrow">{ar ? 'للشركات' : 'FOR COMPANIES'}</div><h2>{ar ? <>تقدير أوضح،<br/>لفريقك.</> : <>A clearer way<br/>to value <em>your team.</em></>}</h2><ul><li><BadgeCheck/>{ar ? 'رموز QR شخصية لكل موظف' : 'Personal QR badges for every worker'}</li><li><BadgeCheck/>{ar ? 'سجلات واضحة للإكراميات والرواتب' : 'Clear tip and payroll records'}</li></ul><Link href="/sign-up" className="business-link" data-testid="link-company-signup">{ar ? 'إنشاء حساب شركة' : 'Create a company account'} <ArrowUpRight size={16}/></Link></div>
       <div className="business-panel business-panel-simple company-preview"><div className="panel-topline"><span>{ar ? 'معاينة لوحة الشركة' : 'COMPANY PREVIEW'}</span><span className="preview-tag">{ar ? 'بيانات نموذجية' : 'SAMPLE DATA'}</span></div><div className="company-preview-content"><div className="sample-badge"><span className="sample-badge-brand">سند</span><QrGraphic/><strong>{ar ? 'موظف تجريبي ١' : 'Demo worker 1'}</strong><small>{ar ? 'موظف خدمة · معاينة' : 'Service team · Preview'}</small></div><div className="sample-dashboard"><span className="sample-dash-title">{ar ? 'نظرة عامة للفريق' : 'TEAM OVERVIEW'} <small>{ar ? 'معاينة' : 'PREVIEW'}</small></span><strong>KWD 84.250</strong><span className="sample-caption">{ar ? 'إكراميات هذا الشهر · بيانات نموذجية' : 'Tips this month · sample only'}</span><div className="sample-bars" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></div><div className="sample-worker"><span className="sample-initials">D1</span><span><b>{ar ? 'موظف تجريبي ١' : 'Demo worker 1'}</b><small>{ar ? 'رمز شخصي نشط' : 'Personal badge active'}</small></span><Check size={14}/></div></div></div><Link href="/sign-up" className="preview-signup" data-testid="link-company-preview-signup">{ar ? 'ابدأ بإعداد فريقك' : 'Set up your team'} <ArrowUpRight size={14}/></Link></div>
    </section>
      <section id="tip-now" className="landing-tip-band landing-reveal"><div className="guest-intro"><span className="eyebrow">{ar ? 'للضيوف' : 'FOR GUESTS'}</span><h2>{ar ? 'امسح رمز الموظف للبدء.' : 'Scan a worker’s QR badge to begin.'}</h2><p>{publicDemo ? publicTestCheckout ? (ar ? 'جرّب الدفع ببطاقة Stripe تجريبية؛ لن يتم تحصيل مبلغ حقيقي.' : 'Try checkout with a Stripe test card. No real charge will be made.') : (ar ? 'جرّب محاكاة إكرامية. لا يتم حفظ سجل أو إجراء دفع حقيقي.' : 'Try a tip simulation. No tip record is saved and no payment is made.') : (ar ? 'جرّب المعاينة، أو أرسل إكرامية حقيقية من صفحة الموظف.' : 'Try the preview, or send a real tip from a worker’s page.')}</p></div>
      <div className="tip-demo" aria-live="polite">
        <div className="demo-heading"><div><span className="demo-label">{ar ? 'معاينة تفاعلية' : 'INTERACTIVE PREVIEW'}</span>{!ar&&<strong>Try a little thank you</strong>}</div><span className="demo-only">{ar ? 'عرض فقط · لا يوجد دفع' : 'DEMO ONLY · NO PAYMENT'}</span></div>
        {demoComplete ? <div className="demo-success"><span className="demo-success-icon"><Check size={20}/></span><div><strong>{ar ? 'معاينتك جاهزة.' : 'Your preview is ready.'}</strong><span data-testid="text-demo-confirmation">{ar ? `المبلغ KWD ${demoAmounts[demoAmount]}${demoRating ? ` · التقييم ${demoRating}/5` : ''}. لا يوجد دفع أو حفظ بيانات.` : `KWD ${demoAmounts[demoAmount]}${demoRating ? ` · ${demoRating}/5 rating` : ''}. Preview only; no payment or data saved.`}</span></div><button type="button" data-testid="button-demo-reset" onClick={() => setDemoComplete(false)}>{ar ? 'جرّب مرة أخرى' : 'Try again'}</button></div> : <>
          <div className="demo-amounts" role="group" aria-label={ar ? 'اختر مبلغاً تجريبياً' : 'Choose a sample tip amount'}>{demoAmounts.map((amount, index) => <button key={amount} type="button" data-testid={`button-demo-amount-${amount.replace('.', '-')}`} className={demoAmount === index ? 'selected' : ''} aria-pressed={demoAmount === index} onClick={() => setDemoAmount(index)}>KWD {amount}</button>)}</div>
          <div className="demo-controls"><div><span>{ar ? 'تقييم اختياري' : 'OPTIONAL RATING'}</span><div className="demo-stars" role="group" aria-label={ar ? 'اختر تقييماً' : 'Choose a rating'}>{[1,2,3,4,5].map((rating) => <button key={rating} type="button" data-testid={`button-demo-rating-${rating}`} aria-label={`${rating} ${ar ? 'نجوم' : rating === 1 ? 'star' : 'stars'}`} aria-pressed={demoRating === rating} onClick={() => setDemoRating(demoRating === rating ? null : rating)}><Star size={17} fill={demoRating && rating <= demoRating ? 'currentColor' : 'none'}/></button>)}</div></div><strong data-testid="text-demo-selected-amount">KWD {demoAmounts[demoAmount]}</strong></div>
          <button type="button" className="demo-submit" data-testid="button-preview-tip-confirmation" onClick={() => setDemoComplete(true)}>{ar ? 'عرض التأكيد التجريبي' : 'Preview confirmation'} <ArrowUpRight size={15}/></button>
        </>}
      </div>
    </section>
    <section id="for-workers" className="business-section landing-business worker-section landing-reveal" aria-labelledby="worker-section-title">
      <div className="business-copy">
        <div className="eyebrow">{ar ? 'للموظفين' : 'FOR WORKERS'}</div>
        <h2 id="worker-section-title">{ar ? 'إكرامياتك، واضحة أمامك.' : <>Your tips,<br/>clearly in view.</>}</h2>
        <p>{ar ? 'اطّلع على رمزك الشخصي، وتابع الإكراميات والتقييمات وسجلات الرواتب التي تسجلها شركتك من لوحة واحدة.' : 'Check your personal QR badge, follow tips and ratings, and review payroll records from one simple dashboard.'}</p>
        <ul><li><BadgeCheck/>{ar ? 'رمز QR شخصي للمشاركة' : 'Your own QR badge to share'}</li><li><BadgeCheck/>{ar ? 'سجل الإكراميات والمدفوعات المسجلة' : 'Tip history and recorded payouts'}</li></ul>
        <Link href="/worker/sign-in" className="business-link" data-testid="link-worker-signin-section">{ar ? 'دخول الموظف' : 'Worker sign in'} <ArrowUpRight size={16}/></Link>
      </div>
      <div className="business-panel worker-preview">
        <div className="panel-topline"><span>{ar ? 'معاينة لوحة الموظف' : 'WORKER PREVIEW'}</span><span className="preview-tag">{ar ? 'بيانات نموذجية' : 'SAMPLE DATA'}</span></div>
        <div className="worker-demo-profile">
          <span className="worker-demo-avatar">D1</span>
          <div><strong>{ar ? 'موظف تجريبي ١' : 'Demo worker 1'}</strong><small>{ar ? 'موظف خدمة · معاينة' : 'Service worker · Preview'}</small></div>
          <QrCode className="worker-demo-qr" size={20}/>
        </div>
        <div className="worker-demo-metrics">
          <div className="worker-demo-metric"><span>{ar ? 'الإكراميات المستلمة' : 'TIPS RECEIVED'}</span><strong>KWD 9.250</strong><small>{ar ? 'الإجمالي' : 'All time'}</small></div>
          <div className="worker-demo-metric"><span>{ar ? 'بانتظار الصرف' : 'AWAITING PAYOUT'}</span><strong>KWD 7.250</strong><small>{ar ? 'مسجلة في الرواتب' : 'Recorded in payroll'}</small></div>
        </div>
        <div className="worker-demo-tip">
          <span className="worker-demo-tip-icon"><Heart size={14}/></span>
          <span className="worker-demo-tip-copy"><strong>{ar ? 'آخر إكرامية' : 'Latest tip'}</strong><small>{ar ? 'معاينة · منذ قليل' : 'Sample · Just now'}</small></span>
          <strong>KWD 1.000</strong>
        </div>
      </div>
    </section>
    <Footer/>
  </main></LocalizedTree>;
}
function Footer() { const { language } = useLanguage(); const ar = language === 'ar'; return <footer className="footer"><Brand/><span>{ar ? 'صُنع بعناية في الكويت.' : 'Made with care in Kuwait.'}</span><div><Link href="/worker/sign-in">{ar ? 'دخول الموظف' : 'Worker sign in'}</Link><Link href="/sign-up">{ar ? 'للشركات' : 'For companies'}</Link><span>© SANAD</span></div></footer>; }
function QrGraphic() {
  return <div className="qr-graphic" aria-label="Decorative QR pattern"><div className="qr-corner"/><div className="qr-corner"/><div className="qr-corner"/>{Array.from({length:25}).map((_,i)=><i key={i} className={((i*7+3)%5===0 || (i*13)%7<2)?'qr-dark':''}/>)}</div>;
}

function TipPage() {
  const [, params] = useRoute('/tip/:slug');
  const slug = params?.slug ?? '';
  const { language } = useLanguage();
  const ar = language === 'ar';
  const publicDemo = import.meta.env.PROD;
  const checkoutEnabled = stripeTestCheckoutEnabled;
  const publicTestCheckout = publicDemo && checkoutEnabled;
  const workerQuery = useGetPublicWorker(slug, { query: { enabled: !!slug, queryKey: getGetPublicWorkerQueryKey(slug) } });
  const worker = workerQuery.data;
  const localPublicSimulation = publicDemo && Boolean(worker && !worker.isDemo);
  const canSimulateTip = Boolean(worker?.isDemo || localPublicSimulation);
  const isLoading = workerQuery.isLoading;
  const isError = workerQuery.isError;
  const refetch = workerQuery.refetch;
  const quoteMutation = useCreateTipQuote();
  const checkout = useCreateTipCheckout();
  const simulateTip = useSimulateTip();
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [quote, setQuote] = useState<TipQuote | null>(null);
  const [quoteRating, setQuoteRating] = useState<number | null>(null);
  const [preparedCheckout, setPreparedCheckout] = useState<TipCheckoutResponse | null>(null);
  const [simulationResult, setSimulationResult] = useState<{ amountFils: number; rating: number | null; savedAsDemo: boolean } | null>(null);
  const [notice, setNotice] = useState<{ en: string; ar: string } | null>(() =>
    new URLSearchParams(window.location.search).get('checkout') === 'cancelled'
      ? { en: 'Checkout was cancelled. No payment was confirmed.', ar: 'تم إلغاء الدفع. لم يتم تأكيد أي مبلغ.' }
      : null,
  );
  const showNotice = (en: string, arabic: string) => setNotice({ en, ar: arabic });
  const [, setLocation] = useLocation();
  const amountFils = custom ? parseKwdAmount(custom) : amount;
  const clearReview = () => {
    setQuote(null);
    setQuoteRating(null);
    setPreparedCheckout(null);
    setNotice(null);
  };
  const requestId = () => {
    const key = 'sanad-tip-request';
    try {
      const saved = JSON.parse(getSessionValue(key) ?? 'null') as {
        id?: string; slug?: string; amountFils?: number; rating?: number | null; createdAt?: number;
      } | null;
      if (
        saved?.id &&
        saved.slug === slug &&
        saved.amountFils === amountFils &&
        (saved.rating ?? null) === rating &&
        typeof saved.createdAt === 'number' &&
        Date.now() - saved.createdAt < 24 * 60 * 60 * 1000
      ) return saved.id;
    } catch {
      removeSessionValue(key);
    }
    const id = window.crypto.randomUUID();
    setSessionValue(key, JSON.stringify({ id, slug, amountFils, rating, createdAt: Date.now() }));
    return id;
  };
  const simulationRequestId = () => {
    const key = 'sanad-simulation-request';
    try {
      const saved = JSON.parse(getSessionValue(key) ?? 'null') as {
        id?: string; slug?: string; amountFils?: number; rating?: number | null; createdAt?: number;
      } | null;
      if (
        saved?.id &&
        saved.slug === slug &&
        saved.amountFils === amountFils &&
        (saved.rating ?? null) === rating &&
        typeof saved.createdAt === 'number' &&
        Date.now() - saved.createdAt < 24 * 60 * 60 * 1000
      ) return saved.id;
    } catch {
      // Storage can be unavailable in private browsing; the in-flight button still prevents duplicate taps.
    }
    const id = window.crypto.randomUUID();
    try {
      setSessionValue(key, JSON.stringify({ id, slug, amountFils, rating, createdAt: Date.now() }));
    } catch {
      // The API still validates and stores this one request.
    }
    return id;
  };
  const submitSimulation = () => {
    setNotice(null);
    if (!worker?.isDemo && !localPublicSimulation) {
      showNotice('Simulation is available only on demo worker pages.', 'المحاكاة متاحة لصفحات العرض التجريبي فقط.');
      return;
    }
    if (amountFils === null || !Number.isSafeInteger(amountFils)) {
      showNotice('Enter an amount with up to three decimal places.', 'أدخل مبلغاً لا يتجاوز ثلاث خانات عشرية.');
      return;
    }
    if (amountFils < MIN_TIP_AMOUNT_FILS) {
      showNotice('The minimum tip is KWD 0.250.', 'الحد الأدنى للإكرامية هو KWD 0.250.');
      return;
    }
    if (amountFils > MAX_TIP_AMOUNT_FILS) {
      showNotice('The maximum tip is KWD 100.000.', 'الحد الأقصى للإكرامية هو KWD 100.000.');
      return;
    }
    if (localPublicSimulation) {
      setSimulationResult({ amountFils, rating, savedAsDemo: false });
      setQuote(null);
      setPreparedCheckout(null);
      return;
    }
    simulateTip.mutate({
      data: { workerSlug: slug, amountFils, rating, requestId: simulationRequestId() },
    }, {
      onSuccess: (result) => {
        setSimulationResult({ amountFils: result.amountFils, rating: result.rating, savedAsDemo: true });
        setQuote(null);
        setPreparedCheckout(null);
      },
      onError: (error) => {
        if (isHttpStatus(error, 400)) {
          showNotice('Check the amount and rating, then try again.', 'تحقق من المبلغ والتقييم ثم حاول مرة أخرى.');
        } else if (isHttpStatus(error, 404)) {
          showNotice('Simulation is available only on demo worker pages.', 'المحاكاة متاحة لصفحات العرض التجريبي فقط.');
        } else if (isHttpStatus(error, 409)) {
          showNotice('This simulation request conflicts with an earlier one. Change the amount or try again.', 'تعذر إتمام المحاكاة بهذا الطلب. غيّر المبلغ أو أعد المحاولة.');
        } else if (isHttpStatus(error, 429)) {
          showNotice('Too many simulations. Please wait a little and try again.', 'تم تجاوز عدد المحاولات. انتظر قليلاً ثم حاول مرة أخرى.');
        } else {
          showNotice('We couldn’t save the simulated tip. No payment was made. Please try again.', 'تعذر حفظ الإكرامية التجريبية. لم يتم الدفع. حاول مرة أخرى.');
        }
      },
    });
  };
  const continueToCheckout = () => {
    if (!checkoutEnabled) return;
    if (preparedCheckout) {
      if (preparedCheckout.checkoutUrl) window.location.assign(preparedCheckout.checkoutUrl);
      else setLocation(`/tip-confirmation?tipId=${encodeURIComponent(preparedCheckout.tipId)}`);
      return;
    }
    if (!quote) return;
    checkout.mutate({
      data: {
        workerSlug: slug,
        amountFils: quote.amountFils,
        rating,
        quoteToken: quote.quoteToken,
        requestId: requestId(),
      },
    }, {
      onSuccess: (result) => {
        try {
          setSessionValue('sanad-tip-id', result.tipId);
          setSessionValue('sanad-tip-mode', result.paymentMode);
          setSessionValue('sanad-tip-worker', worker?.name ?? '');
          const saved = JSON.parse(getSessionValue('sanad-tip-request') ?? 'null');
          if (saved?.id) setSessionValue('sanad-tip-request', JSON.stringify({ ...saved, tipId: result.tipId }));
        } catch { /* Checkout continues even if the browser blocks storage. */ }
        if (result.checkoutUrl) {
          const sameReview =
            result.amountFils === quote.amountFils &&
            result.usdAmountCents === quote.usdAmountCents &&
            result.kwdToUsdRate === quote.kwdToUsdRate;
          if (sameReview) window.location.assign(result.checkoutUrl);
          else {
            setPreparedCheckout(result);
            showNotice(
              'This checkout uses the saved conversion shown below. Review it, then continue.',
              'تم تجهيز الدفع بالمبلغ المحفوظ أدناه. راجعه ثم تابع.',
            );
          }
        } else {
          setLocation(`/tip-confirmation?tipId=${encodeURIComponent(result.tipId)}`);
        }
      },
      onError: (error) => {
        if (isHttpStatus(error, 409)) {
          setQuote(null);
          showNotice('This exchange quote expired. Please review the amount again.', 'انتهت صلاحية سعر التحويل. راجع المبلغ مرة أخرى.');
        } else {
          if (isHttpStatus(error, 503)) {
            showNotice('Test checkout is unavailable. No payment was made.', 'الدفع التجريبي غير متاح حالياً. لم يتم الدفع.');
          } else if (isHttpStatus(error, 502)) {
            showNotice('Currency conversion or checkout is unavailable. No payment was made.', 'خدمة التحويل أو الدفع غير متاحة. لم يتم الدفع.');
          } else {
            showNotice('We couldn’t start checkout. Please try again.', 'تعذر بدء الدفع. حاول مرة أخرى.');
          }
        }
      },
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setNotice(null);
    if (!checkoutEnabled) {
      if (canSimulateTip) {
        submitSimulation();
        return;
      }
      showNotice('Checkout is disabled in this public demo. No tip was saved.', 'الدفع معطل في هذا العرض العام. لم يتم حفظ أي إكرامية.');
      return;
    }
    if (preparedCheckout) { continueToCheckout(); return; }
    if (hasCurrentQuote) { continueToCheckout(); return; }
    if (amountFils === null || !Number.isSafeInteger(amountFils) || amountFils < MIN_TIP_AMOUNT_FILS || amountFils > MAX_TIP_AMOUNT_FILS) {
      showNotice(
        'Choose an amount from KWD 0.250 to KWD 100.000, with no more than three decimal places.',
        'اختر مبلغاً من KWD 0.250 إلى KWD 100.000، وبحد أقصى ثلاث خانات عشرية.',
      );
      return;
    }
    quoteMutation.mutate({ data: { workerSlug: slug, amountFils, rating } }, {
      onSuccess: (result) => { setQuote(result); setQuoteRating(rating); },
      onError: (error) => {
        if (isHttpStatus(error, 503)) {
          showNotice('Currency conversion is not configured. No payment was made.', 'خدمة التحويل غير مُهيأة. لم يتم الدفع.');
        } else if (isHttpStatus(error, 502)) {
          showNotice('The exchange rate is unavailable. No payment was made.', 'سعر التحويل غير متاح. لم يتم الدفع.');
        } else {
          showNotice('We couldn’t prepare the amount. Please try again.', 'تعذر إعداد المبلغ. حاول مرة أخرى.');
        }
      },
    });
  };
  const displayedAmount = preparedCheckout?.amountFils ?? quote?.amountFils;
  const displayedUsdCents = preparedCheckout?.usdAmountCents ?? quote?.usdAmountCents;
  const displayedRate = preparedCheckout?.kwdToUsdRate ?? quote?.kwdToUsdRate;
  const displayedRateSource = preparedCheckout?.rateSource ?? quote?.rateSource;
  const displayedRateUpdatedAt = preparedCheckout?.rateUpdatedAt ?? quote?.rateUpdatedAt;
  const hasCurrentQuote =
    !!quote &&
    amountFils !== null &&
    quote.amountFils === amountFils &&
    quote.workerSlug === slug &&
    quoteRating === rating;
  return <LocalizedTree><main className="tip-page"><div className="tip-top"><Brand/><LanguageToggle/></div><div className="tip-card rise">
    {isLoading ? <Skeleton rows={4}/> : isError || !worker ? <ErrorPanel retry={() => { void refetch(); }}/> : <>
      <div className="tip-profile"><Avatar name={ar && worker.arabicName ? worker.arabicName : worker.name} photo={worker.photoUrl} size="lg"/><span className="tip-brandline">{worker.companyName}</span><h1>{firstName(ar && worker.arabicName ? worker.arabicName : worker.name)}</h1>{ar && worker.arabicName && <span className="arabic tip-arabic" dir="rtl">{worker.name}</span>}<p>{localized(worker.role, language)}{worker.branch ? ` · ${localized(worker.branch, language)}` : ''}</p><p className="tip-beneficiary">{ar ? <>يتم تسجيل ١٠٠٪ من إكراميتك باسم {firstName(worker.arabicName || worker.name)}.</> : <>100% of your tip is recorded for {firstName(worker.name)}.</>}</p></div>
      {simulationResult ? <section className="simulation-success" role="status" aria-live="polite">
        <span className="simulation-success-icon"><Check size={23}/></span>
        <span className="eyebrow">{simulationResult.savedAsDemo ? (ar ? 'تم حفظ إكرامية تجريبية' : 'DEMO TIP SAVED') : (ar ? 'معاينة إكرامية' : 'TIP SIMULATION PREVIEW')}</span>
        <h2>{ar ? `وصلت رسالة شكرك إلى ${firstName(worker.arabicName || worker.name)}` : `${firstName(worker.name)} received your thank you`}</h2>
        <p>{simulationResult.savedAsDemo
          ? ar ? 'تم حفظ الإكرامية كبيانات تجريبية. لم يتم الدفع أو تحويل أي مبلغ حقيقي.' : 'Your simulated tip was saved as demo data. No payment or real payout occurred.'
          : ar ? 'هذه معاينة محلية فقط. لم يتم حفظ إكرامية أو إجراء أي دفع حقيقي.' : 'This was a local preview only. No tip record was saved and no payment was made.'}</p>
        <div className="simulation-details"><span>{simulationResult.savedAsDemo ? (ar ? 'مبلغ الإكرامية التجريبية' : 'Demo tip amount') : (ar ? 'المبلغ المحاكى' : 'Simulated amount')}</span><strong>{money(simulationResult.amountFils)}</strong>{simulationResult.rating != null && <><span>{ar ? 'التقييم' : 'Rating'}</span><strong>{simulationResult.rating} / 5</strong></>}</div>
        <PillButton className="submit-tip" onClick={() => { setSimulationResult(null); setAmount(null); setCustom(''); setRating(null); clearReview(); removeSessionValue('sanad-simulation-request'); }}>{ar ? 'جرّب مرة أخرى' : 'Try another simulated tip'}</PillButton>
      </section> : <form onSubmit={submit} className="tip-form">
        <label className="form-label">{ar ? 'مبلغ الإكرامية' : 'Tip amount'} <small>KWD</small></label>
        <div className="amount-options" role="group" aria-label={ar ? 'اختر مبلغ الإكرامية' : 'Choose a tip amount'}>{[250,500,1000,2000].map((n)=><button disabled={quoteMutation.isPending || simulateTip.isPending} data-testid={`button-amount-${n}`} type="button" onClick={()=>{setAmount(n);setCustom('');clearReview()}} className={`amount-option ${!custom&&amount===n?'chosen':''}`} key={n}>KWD {(n/1000).toFixed(3)}</button>)}</div>
        <label className="custom-amount"><span>{ar ? 'مبلغ مخصص · الحد الأقصى KWD 100.000' : 'Custom amount · maximum KWD 100.000'}</span><div><span>KWD</span><input disabled={quoteMutation.isPending || simulateTip.isPending} data-testid="input-custom-amount" aria-label={ar ? 'مبلغ مخصص بالدينار الكويتي' : 'Custom amount in KWD'} type="text" inputMode="decimal" maxLength={7} placeholder="0.000" value={custom} onChange={(e)=>{setCustom(e.target.value);setAmount(null);clearReview()}}/></div></label>
        <div className="rating-row"><div><strong>{ar ? 'التقييم (اختياري)' : 'Rating (optional)'}</strong></div><div className="rating-stars" role="group" aria-label={ar ? 'اختر تقييماً' : 'Choose a rating'}>{[1,2,3,4,5].map((n)=><button disabled={quoteMutation.isPending || simulateTip.isPending} data-testid={`button-rating-${n}`} aria-label={`${n} ${ar ? 'نجوم' : n === 1 ? 'star' : 'stars'}`} aria-pressed={n<= (rating ?? 0)} type="button" onClick={()=>{setRating(rating===n?null:n);clearReview()}} key={n}><Star size={20} fill={n<=(rating ?? 0)?'currentColor':'none'}/></button>)}</div></div>
        {displayedAmount !== undefined && displayedUsdCents !== undefined && displayedRate && displayedRateSource && displayedRateUpdatedAt && <section className="conversion-review" aria-live="polite">
          <div className="conversion-row"><span>{ar ? 'الإكرامية للموظف' : 'Tip for worker'}</span><strong>{money(displayedAmount)}</strong></div>
          <div className="conversion-row conversion-pay"><span>{ar ? 'المبلغ عند الدفع' : 'Amount at Stripe'}</span><strong>{usdMoney(displayedUsdCents)}</strong></div>
          <p>1 KWD = ${Number(displayedRate).toFixed(6)} USD</p>
          <small>{ar ? 'سعر التحويل حسب' : 'Rate by'} <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">{displayedRateSource}</a> · {new Date(displayedRateUpdatedAt).toLocaleDateString(ar ? 'ar-KW' : 'en-KW')}</small>
        </section>}
        {worker.isDemo && <div className="demo-callout" role="status">{ar ? 'محاكاة فقط · تُحفظ كبيانات تجريبية ولا يتم الدفع أو تحويل أموال حقيقية.' : 'Simulation only · saved as demo data; no payment or real payout occurs.'}</div>}
        {checkoutEnabled && <div className="secure-tip"><ShieldCheck size={16}/><span>{ar ? 'دفع Stripe تجريبي آمن · لا يتم خصم مبلغ حقيقي.' : 'Secure Stripe test checkout · no real charge.'}</span></div>}
        {localPublicSimulation && <div className="demo-callout" role="status">{ar ? 'محاكاة للعرض فقط · لا يتم الدفع أو حفظ سجل إكرامية.' : 'Public demo simulation only · no payment or tip record will be saved.'}</div>}
        {!checkoutEnabled && !worker.isDemo && !localPublicSimulation && <div className="demo-callout" role="status">{ar ? 'الدفع غير متاح في هذا العرض العام. لم يتم حفظ أي إكرامية.' : 'Checkout is unavailable in this public demo. No tip was saved.'}</div>}
        {notice && <div className="form-notice" role="alert">{notice[language]}</div>}
        <div className="tip-actions">
          {(checkoutEnabled || !canSimulateTip) && <PillButton type="submit" className="submit-tip" disabled={!checkoutEnabled || quoteMutation.isPending || checkout.isPending || simulateTip.isPending}>{!checkoutEnabled ? (ar ? 'الدفع غير متاح' : 'Checkout unavailable') : quoteMutation.isPending ? (ar ? 'جارٍ إعداد المبلغ…' : 'Preparing amount…') : checkout.isPending ? (ar ? 'جارٍ تجهيز الدفع…' : 'Preparing checkout…') : preparedCheckout || hasCurrentQuote ? publicTestCheckout ? (ar ? 'متابعة إلى دفع Stripe التجريبي' : 'Continue to Stripe test checkout') : (ar ? 'متابعة إلى الدفع الآمن' : 'Continue to secure payment') : (ar ? 'مراجعة المبلغ' : 'Review amount')} {!checkoutEnabled ? <ShieldCheck size={17}/> : <ArrowUpRight size={17}/>}</PillButton>}
          {canSimulateTip && <PillButton data-testid="button-simulate-tip" className={checkoutEnabled ? 'simulate-tip' : 'submit-tip'} onClick={submitSimulation} disabled={simulateTip.isPending}>{simulateTip.isPending ? (worker.isDemo ? (ar ? 'جارٍ حفظ الإكرامية التجريبية…' : 'Saving demo tip…') : (ar ? 'جارٍ حفظ المحاكاة…' : 'Saving simulation…')) : (worker.isDemo ? (ar ? 'حفظ إكرامية تجريبية' : 'Save demo tip') : (ar ? 'محاكاة الإكرامية' : 'Simulate tip'))} {!simulateTip.isPending && <Sparkles size={16}/>}</PillButton>}
        </div>
      </form>}
    </>}
  </div></main></LocalizedTree>;
}
function ConfirmationPage() {
  const { language } = useLanguage();
  const params = new URLSearchParams(window.location.search);
  const tipId = params.get('tipId') || getSessionValue('sanad-tip-id') || '';
  const demoMode = getSessionValue('sanad-tip-mode') === 'demo';
  const publicDemo = import.meta.env.PROD;
  const publicTestCheckout = publicDemo && stripeTestCheckoutEnabled;
  const demoOnly = publicDemo && !publicTestCheckout;
  const { data: status, isLoading, isError, refetch } = useGetTipStatus(tipId, { query: { enabled: !!tipId && !demoOnly, queryKey: getGetTipStatusQueryKey(tipId), refetchInterval: (query) => query.state.data?.status === 'pending' ? 3000 : false } });
  const state = demoOnly ? 'demo' : status?.status || (demoMode ? 'demo' : 'pending');
  const title = demoOnly
    ? (language === 'ar' ? 'هذا عرض عام فقط.' : 'Public demo only.')
     : state === 'succeeded' ? 'Your thank you is on its way.' : state === 'demo' ? (language === 'ar' ? 'اكتمل الدفع التجريبي.' : 'Stripe test checkout complete.') : state === 'failed' ? 'This payment didn’t go through.' : state === 'cancelled' ? 'Checkout was cancelled.' : 'Checking your tip…';
  const copy = demoOnly
    ? (language === 'ar' ? 'الدفع معطل. لم يتم حفظ أو تحصيل أي إكرامية.' : 'Checkout is disabled. No tip was saved or charged.')
    : state === 'demo' ? (language === 'ar' ? 'تم تأكيد عملية تجريبية عبر Stripe. لم يتم تحصيل مبلغ حقيقي.' : 'Stripe confirmed a test payment. No real charge was made.') : state === 'succeeded' ? 'Your appreciation has been received. Thank you for making someone’s day.' : state === 'pending' ? 'We’re waiting for a confirmed payment status. This page will update automatically.' : 'No charge was confirmed. You can safely try again.';
  return <LocalizedTree><main className="tip-page"><div className="tip-top"><Brand/><LanguageToggle/></div><section className="outcome-card rise"><div className={`outcome-symbol outcome-${state}`}>{state === 'succeeded' ? <Check size={29}/> : state === 'demo' ? <Sparkles size={27}/> : state === 'failed' ? <X size={27}/> : <Clock3 size={27}/>}</div><span className="eyebrow">{state === 'succeeded' ? 'THANK YOU SENT' : state === 'demo' ? publicTestCheckout ? (language === 'ar' ? 'دفع تجريبي' : 'STRIPE TEST CHECKOUT') : 'DEVELOPMENT DEMO' : 'TIP STATUS'}</span><h1>{title}</h1><p>{copy}</p>{isLoading && !demoMode && <div className="loading-line"/>}{isError && <div className="form-notice">{localized('We couldn’t verify the payment status.', language)} <button onClick={()=>void refetch()}>{localized('Check again',language)}</button></div>}{status && <div className="outcome-details"><span>{localized('Recipient',language)}</span><strong>{status.workerName || getSessionValue('sanad-tip-worker') || 'SANAD worker'}</strong><span>{localized('Worker tip',language)}</span><strong>{money(status.amountFils)}</strong>{typeof status.usdAmountCents === 'number' && <><span>Stripe checkout</span><strong>{usdMoney(status.usdAmountCents)}</strong></>}</div>}{status?.isDemo && <div className="demo-callout">{localized('DEMO — this status does not represent a real charge.',language)}</div>}<Link href="/" className="cta-primary centered">{localized('Return to SANAD',language)} <ArrowUpRight size={17}/></Link></section><p className="tip-powered">A thoughtful little gesture, powered by <b>SANAD</b></p></main></LocalizedTree>;
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
      <div className="side-profile"><Avatar name={accountName} photo={company ? null : workerAccount.data?.worker.photoUrl} size="md"/><div><strong>{accountName}</strong><span>{accountRole}</span></div></div>
      <span className="side-section">{companyProfileMissing?'COMPANY SETUP':company?'MANAGE YOUR TEAM':'YOUR SANAD'}</span><nav className="side-nav">{nav.map((item)=>{const active=currentPath===item.href;const Icon=item.icon;return <Link href={item.href} key={item.href} onClick={()=>setMobileNav(false)} className={`side-link ${active?'active':''}`} aria-current={active?'page':undefined} data-testid={`link-nav-${item.href.split('/').pop()}`}><Icon size={17}/><span>{item.label}</span></Link>})}</nav>
       <div className="sidebar-bottom">{!companyProfileMissing&&<Link href={company?'/company/settings':'/worker/settings'} onClick={()=>setMobileNav(false)} className={`side-link side-secondary ${currentPath===(company?'/company/settings':'/worker/settings')?'active':''}`} data-testid="link-nav-settings"><Settings size={17}/><span>Settings</span></Link>}{!company&&workerSession.data?.authenticated&&<button type="button" className="side-link side-secondary side-link-button" data-testid="button-worker-signout" onClick={()=>workerLogout.mutate(undefined,{onSuccess:()=>{queryClient.clear();setLocation('/worker/sign-in')}})}><LogOut size={17}/><span>Sign out</span></button>}<div className="sidebar-help"><div className="help-icon"><CircleHelp size={17}/></div><strong>Need a hand?</strong><span>We’re here to help.</span><a href="mailto:hello@sanad.kw">Get in touch <ArrowUpRight size={12}/></a></div><span className="side-version">SANAD · KUWAIT</span></div>
    </aside>
    {mobileNav && <button aria-label="Close navigation" className="nav-backdrop" onClick={()=>setMobileNav(false)}/>}
    <div className="portal-main"><header className="portal-header"><button className="mobile-menu" onClick={()=>setMobileNav(true)} aria-label="Open menu" aria-expanded={mobileNav} aria-controls="portal-navigation"><Menu/></button><div><span className="breadcrumb">SANAD <ChevronRight size={12}/> {company?'COMPANY':'WORKER'}</span><h1>{localized(title,language)}</h1></div><div className="portal-header-tools"><LanguageToggle/><div className="top-user">{initials(accountName)}</div></div></header>
      <main className="portal-content">
        {children}
        {company && companyAccount.data && !isEmptyCompanyDashboard(companyAccount.data) && currentPath === '/company/workers' && <CompanyDemoExamples section="workers"/>}
        {company && companyAccount.data && !isEmptyCompanyDashboard(companyAccount.data) && currentPath === '/company/transactions' && <CompanyDemoExamples section="transactions"/>}
        {company && companyAccount.data && !isEmptyCompanyDashboard(companyAccount.data) && currentPath === '/company/payouts' && <CompanyDemoExamples section="payouts"/>}
        {company && companyAccount.data && !isEmptyCompanyDashboard(companyAccount.data) && currentPath === '/company/reports' && <CompanyDemoExamples section="reports"/>}
      </main>
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
  return <LocalizedTree><div className="table-scroll"><table className="data-table transaction-table"><thead><tr><th>Guest / transaction</th><th>Amount received</th><th>Date received</th><th>Rating</th><th>Status</th></tr></thead><tbody>{transactions.map((tx)=> <tr key={tx.id} data-testid={`row-transaction-${tx.id}`}><td><div className="table-person"><span className="transaction-avatar"><Heart size={14}/></span><span><b>{tx.workerName}</b></span></div></td><td className="table-amount">{money(tx.amountFils)}</td><td>{dateLabel(tx.createdAt,language)}</td><td>{tx.rating ? <span className="rating-tag"><Star size={12} fill="currentColor"/> {tx.rating}.0</span> : '—'}</td><td><Badge status={tx.isDemo?'demo':tx.status}/></td></tr>)}</tbody></table></div></LocalizedTree>;
}
function isEmptyWorkerDashboard(data: { totalTipsFils: number; monthTipsFils: number; pendingTipsFils: number; paidTipsFils: number; ratingCount: number; recentTransactions: TipTransaction[] } | undefined) {
  return Boolean(data && data.totalTipsFils === 0 && data.monthTipsFils === 0 && data.pendingTipsFils === 0 && data.paidTipsFils === 0 && data.ratingCount === 0 && data.recentTransactions.length === 0);
}
function isEmptyCompanyDashboard(data: { activeWorkers: number; totalTipsFils: number; monthTipsFils: number; pendingTipsFils: number; paidOutFils: number; recentTransactions: TipTransaction[] } | undefined) {
  return Boolean(data && data.activeWorkers === 0 && data.totalTipsFils === 0 && data.monthTipsFils === 0 && data.pendingTipsFils === 0 && data.paidOutFils === 0 && data.recentTransactions.length === 0);
}
function DemoPreviewNotice({ language, testId = 'status-demo-preview' }: { language: Language; testId?: string }) {
  return <div className="demo-callout company-demo-preview-note" role="status" data-testid={testId}>
    <Sparkles size={15} aria-hidden="true"/>
    <span>{language === 'ar'
      ? 'معاينة بيانات تجريبية فقط. هذه الأمثلة غير محفوظة ولا تغيّر سجلات حسابك.'
      : 'Demo preview only. These examples are not saved and do not change your account records.'}</span>
  </div>;
}
function makeCompanyDemoTransactions(language: Language): TipTransaction[] {
  const now = Date.now();
  const rows = [
    { worker: 1, amountFils: 500, rating: 4, hoursAgo: 2 },
    { worker: 2, amountFils: 1000, rating: 5, hoursAgo: 7 },
    { worker: 3, amountFils: 750, rating: 4, hoursAgo: 26 },
    { worker: 4, amountFils: 500, rating: 5, hoursAgo: 48 },
    { worker: 5, amountFils: 250, rating: 4, hoursAgo: 72 },
    { worker: 6, amountFils: 1000, rating: 5, hoursAgo: 96 },
  ];
  return rows.map((row) => ({
    id: `company-preview-tip-${row.worker}`,
    workerId: `company-preview-worker-${row.worker}`,
    workerName: demoWorkerName(row.worker, language),
    amountFils: row.amountFils,
    currency: 'KWD',
    status: 'demo',
    rating: row.rating,
    createdAt: new Date(now - row.hoursAgo * 60 * 60 * 1000).toISOString(),
    isDemo: true,
  }));
}
function makeWorkerDemoTransactions(workerId: string, workerName: string): TipTransaction[] {
  const now = Date.now();
  const rows = [
    { amountFils: 500, rating: 4, daysAgo: 0.1 },
    { amountFils: 1000, rating: 5, daysAgo: 4 },
    { amountFils: 750, rating: 4, daysAgo: 8 },
    { amountFils: 1500, rating: 5, daysAgo: 20 },
    { amountFils: 250, rating: 4, daysAgo: 35 },
    { amountFils: 1000, rating: 5, daysAgo: 68 },
  ];
  return rows.map((row, index) => ({
    id: `worker-preview-tip-${index + 1}`,
    workerId,
    workerName,
    amountFils: row.amountFils,
    currency: 'KWD',
    status: 'demo',
    rating: row.rating,
    createdAt: new Date(now - row.daysAgo * 86400000).toISOString(),
    isDemo: true,
  }));
}
function monthAtOffset(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function demoMonthlyValues() {
  const amounts = [500, 750, 1000, 1250, 2000, 3750];
  return amounts.map((amountFils, index) => ({ month: monthAtOffset(kuwaitMonth(), index - amounts.length + 1), amountFils }));
}
function demoCompanyReport(month: string) {
  const tips = [500, 750, 1000, 1250, 2000, 3750];
  const paid = [0, 100, 150, 250, 500, 1000];
  const transactions = [2, 2, 3, 4, 6, 12];
  const [year, monthNumber] = month.split('-').map(Number);
  const [currentYear, currentMonthNumber] = kuwaitMonth().split('-').map(Number);
  const offset = (year - currentYear) * 12 + monthNumber - currentMonthNumber;
  const index = tips.length - 1 + offset;
  const tipsFils = index >= 0 && index < tips.length ? tips[index] : 0;
  const paidOutFils = index >= 0 && index < paid.length ? paid[index] : 0;
  return { month, tipsFils, paidOutFils, pendingFils: tipsFils - paidOutFils, workerCount: tipsFils ? 6 : 0, transactionCount: index >= 0 && index < transactions.length ? transactions[index] : 0, isDemo: true };
}
function makeDemoPayoutRecords(workers: { id: string; name: string }[], language: Language): PayoutRecord[] {
  const records = [
    { worker: 0, amountFils: 2000, status: 'paid' as const, daysAgo: 4 },
    { worker: 1, amountFils: 1000, status: 'pending' as const, daysAgo: 2 },
  ];
  return records.map((record, index) => {
    const worker = workers[record.worker] ?? workers[0] ?? { id: `demo-worker-${record.worker + 1}`, name: demoWorkerName(record.worker + 1, language) };
    return {
      id: `demo-preview-payout-${index + 1}`,
      workerId: worker.id,
      workerName: worker.name,
      amountFils: record.amountFils,
      month: kuwaitMonth(),
      status: record.status,
      recordedAt: new Date(Date.now() - record.daysAgo * 86400000).toISOString(),
      note: language === 'ar' ? 'سجل رواتب تجريبي' : 'Sample payroll record',
      isDemo: true,
    };
  });
}
function companyDemoWorkers(language: Language) {
  const rows = [
    { role: language === 'ar' ? 'مقدم خدمة' : 'Server', branch: language === 'ar' ? 'السالمية' : 'Salmiya', totalTipsFils: 2000 },
    { role: language === 'ar' ? 'مضيف' : 'Host', branch: language === 'ar' ? 'مدينة الكويت' : 'Kuwait City', totalTipsFils: 1500 },
    { role: language === 'ar' ? 'نادل' : 'Waiter', branch: language === 'ar' ? 'السالمية' : 'Salmiya', totalTipsFils: 1250 },
    { role: language === 'ar' ? 'باريستا' : 'Barista', branch: language === 'ar' ? 'مدينة الكويت' : 'Kuwait City', totalTipsFils: 1500 },
    { role: language === 'ar' ? 'مقدم خدمة' : 'Server', branch: language === 'ar' ? 'السالمية' : 'Salmiya', totalTipsFils: 1000 },
    { role: language === 'ar' ? 'نادل' : 'Waiter', branch: language === 'ar' ? 'مدينة الكويت' : 'Kuwait City', totalTipsFils: 2000 },
  ];
  return rows.map((row, index) => ({ id: `company-preview-worker-${index + 1}`, name: demoWorkerName(index + 1, language), ...row }));
}
function CompanyWorkerPreviewTable({ workers }: { workers: ReturnType<typeof companyDemoWorkers> }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Worker</th><th>Role & branch</th><th>Tips received</th><th>Status</th></tr></thead><tbody>{workers.map(worker=><tr key={worker.id}><td><div className="table-person"><Avatar name={worker.name} size="sm"/><span><b>{worker.name}</b><small>Sample worker</small></span></div></td><td><div><b>{worker.role}</b><small>{worker.branch}</small></div></td><td className="table-amount">{money(worker.totalTipsFils)}</td><td><Badge status="demo"/></td></tr>)}</tbody></table></div>;
}
function WorkerDemoPreview({ language, workerName }: { language: Language; workerName: string }) {
  return <>
    <DemoPreviewNotice language={language} testId="status-worker-demo-preview"/>
    <div className="metric-grid" data-testid="worker-demo-preview-metrics">
      <Metric label="Tips received" value={money(9250)} caption="All time" icon={Wallet} accent/>
      <Metric label="This month" value={money(3750)} caption="Since the 1st" icon={ArrowUpRight}/>
      <Metric label="Awaiting payout" value={money(7250)} caption="Not yet in payroll" icon={Clock3}/>
      <Metric label="Average rating" value="4.6 / 5" caption={language === 'ar' ? 'من ١٠ تقييمات' : 'From 10 ratings'} icon={Star}/>
    </div>
    <section className="surface data-section">
      <div className="section-heading">
        <h3>{language === 'ar' ? 'أحدث الإكراميات' : 'Latest tips'}</h3>
        <DemoFlag demo/>
      </div>
      <TransactionTable transactions={makeWorkerDemoTransactions('worker-preview', workerName)}/>
    </section>
  </>;
}
function WorkerOverview() {
  const q = useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  const d=q.data;
  const { language } = useLanguage();
  const showDemoPreview = isEmptyWorkerDashboard(d);
  const ratingCaption = !d || d.ratingCount === 0
    ? (language === 'ar' ? 'لا توجد تقييمات بعد' : 'No ratings yet')
    : language === 'ar'
      ? d.ratingCount === 1 ? 'من تقييم واحد' : d.ratingCount === 2 ? 'من تقييمين' : `من ${d.ratingCount} تقييمات`
      : `From ${d.ratingCount} ${d.ratingCount === 1 ? 'rating' : 'ratings'}`;
  return <PortalLayout title="Overview"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{d&&(showDemoPreview?<WorkerDemoPreview language={language} workerName={d.worker.name}/>:<><div className="metric-grid"><Metric label="Tips received" value={money(d.totalTipsFils)} caption="All time" icon={Wallet} accent/><Metric label="This month" value={money(d.monthTipsFils)} caption="Since the 1st" icon={ArrowUpRight}/><Metric label="Awaiting payout" value={money(d.pendingTipsFils)} caption="Not yet in payroll" icon={Clock3}/><Metric label="Average rating" value={d.averageRating==null?'—':`${d.averageRating.toFixed(1)} / 5`} caption={ratingCaption} icon={Star}/></div><section className="surface data-section"><div className="section-heading"><div><h3>Latest tips</h3></div><div className="section-tools"><DemoFlag demo={d.isDemo}/><Link href="/worker/transactions" className="text-link">All transactions <ArrowUpRight size={14}/></Link></div></div><TransactionTable transactions={d.recentTransactions}/></section></>)}</QueryState></PortalLayout>;
}
function WorkerTransactions() {
  const { language }=useLanguage();
  const q=useListWorkerTransactions({query:{queryKey:getListWorkerTransactionsQueryKey()}});
  const dashboard=useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  const showDemoPreview=isEmptyWorkerDashboard(dashboard.data)&&(q.data?.length??0)===0;
  const transactions=showDemoPreview&&dashboard.data?makeWorkerDemoTransactions(dashboard.data.worker.id,dashboard.data.worker.name):q.data;
  return <PortalLayout title="Transactions"><QueryState loading={q.isLoading||dashboard.isLoading} error={q.isError||dashboard.isError} retry={()=>{void q.refetch();void dashboard.refetch()}}>{showDemoPreview&&<DemoPreviewNotice language={language}/>}<section className="surface data-section"><div className="section-heading"><div><h3>Tip history <span className="subtle-count">{transactions?.length ?? 0}</span></h3></div><div className="section-tools"><DemoFlag demo={showDemoPreview||q.data?.some(x=>x.isDemo)}/>{!showDemoPreview&&<button onClick={()=>downloadCsv(q.data||[],'sanad-worker-transactions.csv')} className="outline-button"><Download size={15}/> Export</button>}</div></div><TransactionTable transactions={transactions}/></section></QueryState></PortalLayout>;
}
function PayoutList({ payouts, empty, onStatusChange, updatingId }: { payouts?: PayoutRecord[]; empty: string; onStatusChange?: (payout: PayoutRecord) => void; updatingId?: string }) {
  const { language } = useLanguage();
  if(!payouts?.length) return <EmptyPanel title="No payout records yet" text={empty}/>;
  return <LocalizedTree><div className="table-scroll"><table className="data-table"><thead><tr><th>Payroll period</th><th>Recorded</th><th>Amount</th><th>Status</th>{onStatusChange&&<th>Update record</th>}</tr></thead><tbody>{payouts.map((p)=><tr key={p.id}><td><div><b>{monthName(p.month,language)}</b><small>{p.note||'SANAD payout record'}{p.isDemo?' · Demo':''}</small></div></td><td>{dateLabel(p.recordedAt,language)}</td><td className="table-amount">{money(p.amountFils)}</td><td><Badge status={p.status}/></td>{onStatusChange&&<td><button className="outline-button compact" disabled={updatingId===p.id} onClick={()=>onStatusChange(p)}>{updatingId===p.id?'Saving…':p.status==='paid'?'Mark pending':'Mark paid'}</button></td>}</tr>)}</tbody></table></div></LocalizedTree>;
}
function WorkerEarnings() {
  const { language }=useLanguage();
  const d=useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  const showDemoPreview=isEmptyWorkerDashboard(d.data);
  const totalTipsFils=showDemoPreview?9250:d.data?.totalTipsFils??0;
  const monthTipsFils=showDemoPreview?3750:d.data?.monthTipsFils??0;
  const paidTipsFils=showDemoPreview?2000:d.data?.paidTipsFils??0;
  const monthly=showDemoPreview?demoMonthlyValues():d.data?.monthly??[];
  return <PortalLayout title="Earnings"><QueryState loading={d.isLoading} error={d.isError} retry={()=>void d.refetch()}>{d.data&&<>{showDemoPreview&&<DemoPreviewNotice language={language}/>}<div className="metric-grid metric-grid-three"><Metric label="Total tips" value={money(totalTipsFils)} caption="All time" icon={Wallet} accent/><Metric label="This month" value={money(monthTipsFils)} caption="Since the 1st" icon={ArrowUpRight}/><Metric label="Paid out" value={money(paidTipsFils)} caption="Payroll recorded" icon={Banknote}/></div><section className="surface chart-surface earnings-chart"><TrendChart values={monthly}/></section></>}</QueryState></PortalLayout>;
}
function WorkerPayouts() {
  const { language }=useLanguage();
  const p=useListWorkerPayouts({query:{queryKey:getListWorkerPayoutsQueryKey()}});
  const dashboard=useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  const showDemoPreview=isEmptyWorkerDashboard(dashboard.data)&&(p.data?.length??0)===0;
  const payouts=showDemoPreview&&dashboard.data?makeDemoPayoutRecords([{id:dashboard.data.worker.id,name:dashboard.data.worker.name}],language):p.data;
  return <PortalLayout title="Payouts"><QueryState loading={p.isLoading||dashboard.isLoading} error={p.isError||dashboard.isError} retry={()=>{void p.refetch();void dashboard.refetch()}}>{showDemoPreview&&<DemoPreviewNotice language={language}/>}<section className="surface data-section"><div className="section-heading"><h3>Payroll records</h3><DemoFlag demo={showDemoPreview||p.data?.some(x=>x.isDemo)}/></div><p className="compact-note">Company-entered records · No bank transfer.</p><PayoutList payouts={payouts} empty="Your company’s payroll records will appear here."/></section></QueryState></PortalLayout>;
}
function WorkerQr() {
  const q=useGetWorkerBadge({query:{queryKey:getGetWorkerBadgeQueryKey()}});
  const [copied,setCopied]=useState(false);
  const rawUrl=q.data ? q.data.tippingUrl || `${window.location.origin}${basePath}/tip/${q.data.workerSlug}` : '';
  const url=rawUrl ? baseAwareUrl(rawUrl) : '';
  const copy=async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}};
  return <PortalLayout title="My QR Badge"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{q.data&&<div className="qr-page-grid"><section className="surface qr-preview"><div className="badge-company">{q.data.companyName}</div><Avatar name={q.data.workerName} photo={q.data.photoUrl} size="md"/><h3>{q.data.workerName}</h3><span>Scan to tip</span><div className="qr-large"><QRCodeSVG className="real-qr" value={url} size={190} level="H" includeMargin fgColor="#3B1720" bgColor="#FFFFFF" title={`SANAD tip QR for ${q.data.workerName}`}/></div><DemoFlag demo={q.data.isDemo}/></section><section className="surface qr-instructions"><div className="panel-kicker">TIP LINK</div><h3>Share your badge</h3><div className="copy-link"><span>{url}</span><button onClick={()=>void copy()} data-testid="button-copy-link">{copied?<Check size={15}/>:<span>Copy</span>}</button></div><PillButton onClick={()=>window.print()} className="download-badge"><Download size={15}/> Print badge</PillButton></section></div>}</QueryState></PortalLayout>;
}
function WorkerSettings() {
  const q=useGetWorkerDashboard({query:{queryKey:getGetWorkerDashboardQueryKey()}});
  const {language}=useLanguage();
  const queryClient=useQueryClient();
  const changePassword=useChangeWorkerPassword();
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [passwordError,setPasswordError]=useState('');
  const [passwordSaved,setPasswordSaved]=useState(false);
  const submitPasswordChange=(event:FormEvent)=>{
    event.preventDefault();
    setPasswordError('');
    setPasswordSaved(false);
    changePassword.reset();
    if(newPassword!==confirmPassword){setPasswordError('Passwords do not match.');return}
    changePassword.mutate({data:{currentPassword,newPassword}},{onSuccess:()=>{
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      void queryClient.invalidateQueries({queryKey:getGetWorkerAuthSessionQueryKey()});
    }});
  };
  return <PortalLayout title="Settings"><QueryState loading={q.isLoading} error={q.isError} retry={()=>void q.refetch()}>{q.data&&<>
    <div className="welcome-row"><div><div className="eyebrow">Your SANAD profile</div><h2>Your details, kept simple.</h2><p>Profile information is managed by your company.</p></div></div>
    <section className="surface settings-panel"><div className="settings-person"><Avatar name={q.data.worker.name} photo={q.data.worker.photoUrl}/><div><h3>{q.data.worker.name}</h3><span>{q.data.worker.role} · {q.data.worker.branch}</span></div><Badge status={q.data.worker.status}/></div><WorkerPhotoEditor workerId={q.data.worker.id} name={q.data.worker.name} photoUrl={q.data.worker.photoUrl} onSaved={()=>void queryClient.invalidateQueries({queryKey:getGetWorkerDashboardQueryKey()})}/><div className="settings-row"><span>Display name</span><strong>{q.data.worker.name}</strong></div><div className="settings-row"><span>Arabic name</span><strong className="arabic">{q.data.worker.arabicName||'—'}</strong></div><div className="settings-row"><span>Phone number</span><strong dir="ltr">{q.data.worker.phoneNumber||'—'}</strong></div><div className="settings-row"><span>Team / branch</span><strong>{q.data.worker.branch||'—'}</strong></div><div className="notice-box"><ShieldCheck size={17}/><span>Need to update something? Ask your company manager to change your profile details.</span></div></section>
    <form className="surface settings-form worker-password-form" onSubmit={submitPasswordChange}>
      <div className="panel-kicker">SECURITY</div><h3>Change password</h3>
      <label>Current password<input data-testid="input-worker-current-password" required type="password" autoComplete="current-password" value={currentPassword} onChange={event=>{setCurrentPassword(event.target.value);setPasswordSaved(false)}}/></label>
      <label>New password<input data-testid="input-worker-new-password" required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={event=>{setNewPassword(event.target.value);setPasswordSaved(false)}}/></label>
      <label>Confirm new password<input data-testid="input-worker-confirm-password" required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={event=>{setConfirmPassword(event.target.value);setPasswordSaved(false)}}/></label>
      <small className="worker-password-hint">Use at least 12 characters.</small>
      {(passwordError||changePassword.isError)&&<div className="form-notice" role="alert">{passwordError||'Could not update your password. Check your current password and try again.'}</div>}
      {passwordSaved&&<div className="success-notice"><Check size={15}/> Password updated.</div>}
      <button className="solid-button worker-password-submit" type="submit" disabled={changePassword.isPending}>{changePassword.isPending?'Updating…':'Update password'} <ArrowUpRight size={15}/></button>
    </form>
  </>}</QueryState></PortalLayout>;
}

function CompanyOnboarding() {
  const create=useCreateCompanyProfile();
  const qc=useQueryClient();
  const [name,setName]=useState('');const [registration,setRegistration]=useState('');const [email,setEmail]=useState('');
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{name,registrationNumber:registration||null,contactEmail:email||null}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()});void qc.invalidateQueries({queryKey:getListCompanyWorkersQueryKey()})}})};
  return <LocalizedTree><div className="onboarding-wrap"><div className="onboarding-story"><div className="onboarding-seal"><BadgeCheck size={22}/></div><div className="eyebrow">COMPANY</div><h2>Set up<br/><em>your company.</em></h2><p>Add company details to create your SANAD workspace.</p></div><form className="surface onboarding-form" onSubmit={submit}><div className="panel-kicker">COMPANY PROFILE</div><h3>Company details</h3><label>Company name<input required minLength={2} maxLength={160} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Marina House"/></label><label>Commercial registration number<input maxLength={100} value={registration} onChange={e=>setRegistration(e.target.value)} placeholder="Optional"/></label><label>Contact email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="team@company.com"/></label>{create.isError&&<div className="form-notice" role="alert">Couldn’t set up your company. Check the details and try again.</div>}<PillButton type="submit" disabled={create.isPending}>{create.isPending?'Creating…':'Create workspace'} <ArrowUpRight size={15}/></PillButton><small><ShieldCheck size={13}/> Your company details stay within your workspace.</small></form></div></LocalizedTree>;
}
function demoWorkerName(ordinal: number, language: Language) {
  if (language !== 'ar') return `Demo worker ${ordinal}`;
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const arabicOrdinal = String(ordinal).replace(/\d/g, (digit) => arabicDigits[Number(digit)] ?? digit);
  return `موظف تجريبي ${arabicOrdinal}`;
}

function CompanyDemoPreview({ language }: { language: Language }) {
  const sampleTips = makeCompanyDemoTransactions(language);
  const samplePayouts = [
    { id: 'company-preview-payout-1', worker: 1, amountFils: 2000, status: 'paid' },
    { id: 'company-preview-payout-2', worker: 2, amountFils: 1000, status: 'pending' },
  ];

  return <>
    <DemoPreviewNotice language={language} testId="status-company-demo-preview"/>
    <div className="metric-grid metric-grid-three" data-testid="company-demo-preview-metrics">
      <Metric label="Tips received" value={money(9250)} caption="Across your team" icon={Wallet} accent/>
      <Metric label="This month" value={money(3750)} caption="All team tips" icon={ArrowUpRight}/>
      <Metric label="Pending payroll" value={money(7250)} caption="Ready to record" icon={Clock3}/>
    </div>
    <section className="surface data-section">
      <div className="section-heading"><h3>{language === 'ar' ? 'أحدث الإكراميات' : 'Recent tips'}</h3><DemoFlag demo/></div>
      <TransactionTable transactions={sampleTips}/>
    </section>
    <section className="surface data-section company-demo-payouts" data-testid="section-company-demo-payouts">
      <div className="section-heading">
        <div>
          <h3>{language === 'ar' ? 'سجل رواتب تجريبي' : 'Sample payroll'}</h3>
          <p className="company-demo-payout-caption">{language === 'ar' ? 'أمثلة فقط · لا يتم تحويل أي مبالغ' : 'Examples only · no payout is sent'}</p>
        </div>
        <DemoFlag demo/>
      </div>
      <div className="company-demo-payout-list">
        {samplePayouts.map((payout) => (
          <div className="company-demo-payout-row" key={payout.id} data-testid={`row-demo-payout-${payout.id}`}>
            <div className="company-demo-payout-person">
              <strong>{demoWorkerName(payout.worker, language)}</strong>
              <small>{language === 'ar' ? 'سجل تجريبي' : 'Sample record'}</small>
            </div>
            <strong className="company-demo-payout-amount">{money(payout.amountFils)}</strong>
            <Badge status={payout.status}/>
          </div>
        ))}
      </div>
    </section>
  </>;
}

function CompanyDemoExamples({ section }: { section: 'workers' | 'transactions' | 'payouts' | 'reports' }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const sampleTips = makeCompanyDemoTransactions(language);
  const sampleWorkers = companyDemoWorkers(language);
  const samplePayouts = makeDemoPayoutRecords(sampleWorkers.map(worker => ({ id: worker.id, name: worker.name })), language);
  const sampleReport = demoCompanyReport(kuwaitMonth());
  const title = section === 'workers'
    ? (ar ? 'موظفون تجريبيون' : 'Sample workers')
    : section === 'transactions'
      ? (ar ? 'إكراميات تجريبية' : 'Sample tip transactions')
      : section === 'payouts'
        ? (ar ? 'سجلات رواتب تجريبية' : 'Sample payroll records')
        : (ar ? 'تقرير شهري تجريبي' : 'Sample monthly report');
  const note = ar
    ? 'هذه أمثلة للعرض فقط. لا تُحفظ ولا تُضاف إلى سجلات شركتك.'
    : 'Examples for preview only. They are not saved or added to your company records.';

  if (section === 'workers') {
    return <section className="surface data-section company-demo-section" data-testid="section-company-demo-workers">
      <div className="section-heading"><div><h3>{title}</h3><p className="company-demo-caption">{note}</p></div><DemoFlag demo/></div>
      <div className="company-demo-worker-grid">
        {sampleWorkers.map((worker, index) => <article className="company-demo-worker-card" key={worker.id} data-testid={`card-demo-worker-${index + 1}`}>
          <div className="company-demo-worker-heading"><span className="company-demo-worker-avatar">{`D${index + 1}`}</span><div><strong>{worker.name}</strong><small>{ar ? 'موظف تجريبي' : 'Sample worker'}</small></div></div>
          <div className="company-demo-worker-details"><span>{worker.role}</span><span>{worker.branch}</span></div>
          <div className="company-demo-worker-tips"><span>{ar ? 'إكراميات تجريبية' : 'Sample tips'}</span><strong>{money(worker.totalTipsFils)}</strong></div>
        </article>)}
      </div>
    </section>;
  }

  if (section === 'transactions') {
    return <section className="surface data-section company-demo-section" data-testid="section-company-demo-transactions">
      <div className="section-heading"><div><h3>{title}</h3><p className="company-demo-caption">{note}</p></div><DemoFlag demo/></div>
      <TransactionTable transactions={sampleTips}/>
    </section>;
  }

  if (section === 'payouts') {
    return <section className="surface data-section company-demo-section" data-testid="section-company-demo-payout-examples">
      <div className="section-heading"><div><h3>{title}</h3><p className="company-demo-caption">{ar ? 'أمثلة فقط · لا يتم تسجيل دفعة أو تحويل أي مبلغ.' : 'Examples only · no payout is recorded or sent.'}</p></div><DemoFlag demo/></div>
      <div className="company-demo-payout-list">
        {samplePayouts.map(payout => <div className="company-demo-payout-row" key={payout.id} data-testid={`row-demo-payout-tab-${payout.id}`}>
          <div className="company-demo-payout-person"><strong>{payout.workerName}</strong><small>{ar ? 'سجل تجريبي' : 'Sample record'}</small></div>
          <strong className="company-demo-payout-amount">{money(payout.amountFils)}</strong>
          <span className="company-demo-payout-status">{ar ? `مثال · ${payout.status === 'paid' ? 'مدفوع' : 'معلّق'}` : `SAMPLE · ${payout.status.toUpperCase()}`}</span>
        </div>)}
      </div>
    </section>;
  }

  return <section className="surface report-panel company-demo-section" data-testid="section-company-demo-report">
    <div className="report-title"><div className="report-icon"><FileText/></div><div><span className="panel-kicker">{ar ? 'تقرير توضيحي' : 'SAMPLE REPORT'}</span><h3>{monthName(sampleReport.month, language)} · {title}</h3></div><DemoFlag demo/></div>
    <p className="company-demo-caption">{note}</p>
    <div className="report-rows">
      <div><span>{ar ? 'إجمالي الإكراميات' : 'Total tips'}</span><strong>{money(sampleReport.tipsFils)}</strong></div>
      <div><span>{ar ? 'رواتب معلّقة' : 'Pending payroll'}</span><strong>{money(sampleReport.pendingFils)}</strong></div>
      <div><span>{ar ? 'رواتب مدفوعة' : 'Paid out'}</span><strong>{money(sampleReport.paidOutFils)}</strong></div>
      <div><span>{ar ? 'موظفون' : 'Workers'}</span><strong>{sampleReport.workerCount}</strong></div>
      <div><span>{ar ? 'معاملات' : 'Transactions'}</span><strong>{sampleReport.transactionCount}</strong></div>
    </div>
  </section>;
}
function CompanyOverview() {
  const q=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey(),retry:false}});
  const notConfigured=q.isError&&isHttp404(q.error);
  const { language } = useLanguage();
  const dashboard = q.data;
  const showDemoPreview = isEmptyCompanyDashboard(dashboard);
  return <PortalLayout company title={notConfigured?'Set up your company':'Overview'}><QueryState loading={q.isLoading} error={q.isError&&!notConfigured} retry={()=>void q.refetch()}>{notConfigured?<CompanyOnboarding/>:dashboard&&<><div className="overview-actions company-overview-actions"><DemoFlag demo={dashboard.isDemo||showDemoPreview}/><Link href="/company/workers" className="solid-button" data-testid="link-manage-workers"><Users size={15}/> Manage Workers</Link></div>{showDemoPreview?<CompanyDemoPreview language={language}/>:<><div className="metric-grid metric-grid-three"><Metric label="Tips received" value={money(dashboard.totalTipsFils)} caption="Across your team" icon={Wallet} accent/><Metric label="This month" value={money(dashboard.monthTipsFils)} caption="All team tips" icon={ArrowUpRight}/><Metric label="Pending payroll" value={money(dashboard.pendingTipsFils)} caption="Ready to record" icon={Clock3}/></div><section className="surface data-section"><div className="section-heading"><h3>Recent tips</h3><Link href="/company/transactions" className="text-link">All transactions <ArrowUpRight size={14}/></Link></div><TransactionTable transactions={dashboard.recentTransactions}/></section></>}</>}</QueryState></PortalLayout>;
}
function CompanyQrBadges() {
  const q=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
  const dashboard=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey()}});
  const { language }=useLanguage();
  const [copied,setCopied]=useState('');
  const badgeWorkers=(q.data||[]).filter(worker=>worker.status==='active');
  const sampleWorkers=companyDemoWorkers(language);
  const showDemoPreview=isEmptyCompanyDashboard(dashboard.data)&&(q.data?.length??0)===0;
  const tipUrl=(slug:string)=>baseAwareUrl(`${window.location.origin}${basePath}/tip/${encodeURIComponent(slug)}`);
  const copy=async(workerId:string,url:string)=>{try{await navigator.clipboard.writeText(url);setCopied(workerId);window.setTimeout(()=>setCopied(''),1600)}catch{setCopied('')}};
  return <PortalLayout company title="QR Badges"><QueryState loading={q.isLoading||dashboard.isLoading} error={q.isError||dashboard.isError} retry={()=>{void q.refetch();void dashboard.refetch()}}>{showDemoPreview?<><DemoPreviewNotice language={language}/><section className="surface company-badge-list" aria-label="Sample worker QR badges"><div className="section-heading company-badge-heading"><h3>Sample worker badges <span className="subtle-count">{sampleWorkers.length}</span></h3><DemoFlag demo/></div>{sampleWorkers.map(worker=><article className="company-badge-row" key={worker.id} data-testid={`card-worker-qr-${worker.id}`}><QRCodeSVG value={`SANAD-DEMO-PREVIEW-${worker.id}`} size={72} level="M" includeMargin fgColor="#3B1720" bgColor="#FAF4EC" title={`Non-functional sample QR for ${worker.name}`}/><div className="company-badge-person"><strong>{worker.name}</strong><span>{worker.role} · {worker.branch}</span><code dir="ltr">{language==='ar'?'رمز تجريبي غير فعّال':'Preview only · no live tip link'}</code></div></article>)}</section></>:badgeWorkers.length?<section className="surface company-badge-list" aria-label="Worker QR badges"><div className="section-heading company-badge-heading"><h3>Worker badges <span className="subtle-count">{badgeWorkers.length}</span></h3><DemoFlag demo={badgeWorkers.some(worker=>worker.isDemo)}/></div>{badgeWorkers.map(worker=>{const url=tipUrl(worker.slug);return <article className="company-badge-row" key={worker.id} data-testid={`card-worker-qr-${worker.id}`}><QRCodeSVG value={url} size={72} level="M" includeMargin fgColor="#3B1720" bgColor="#FAF4EC" title={`SANAD tip QR for ${worker.name}`}/><div className="company-badge-person"><strong>{worker.name}</strong><span>{worker.role}{worker.branch?` · ${worker.branch}`:''}</span><code dir="ltr">{url}</code></div><div className="company-badge-actions"><button className="outline-button compact" type="button" onClick={()=>void copy(worker.id,url)} data-testid={`button-copy-worker-tip-${worker.id}`}>{copied===worker.id?<Check size={13}/>:<Copy size={13}/>} {copied===worker.id?(language==='ar'?'تم النسخ':'Copied'):(language==='ar'?'نسخ الرابط':'Copy link')}</button><a className="outline-button compact" href={url} target="_blank" rel="noreferrer" data-testid={`link-open-worker-tip-${worker.id}`}>{language==='ar'?'فتح الرابط':'Open tip page'} <ArrowUpRight size={13}/></a></div></article>})}</section>:<EmptyPanel title="No active worker badges" text="Activate a worker to show their QR code."/>}</QueryState></PortalLayout>;
}
function CompanyWorkers() {
  const { language }=useLanguage();
  const q=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
  const dashboard=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey()}});
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
  const sampleWorkers=companyDemoWorkers(language);
  const showDemoPreview=isEmptyCompanyDashboard(dashboard.data)&&(q.data?.length??0)===0;
  const demoVisible=sampleWorkers.filter(w=>`${w.name} ${w.role} ${w.branch}`.toLowerCase().includes(filter.toLowerCase()));
  return <PortalLayout company title="Workers"><QueryState loading={q.isLoading||dashboard.isLoading} error={q.isError||dashboard.isError} retry={()=>{void q.refetch();void dashboard.refetch()}}>{showDemoPreview&&<DemoPreviewNotice language={language}/ >}{resetPassword.isError&&<div className="form-notice" role="alert">Couldn’t issue a new temporary password. Try again.</div>}<section className="surface data-section"><div className="section-heading"><div><h3>Team <span className="subtle-count">{showDemoPreview?demoVisible.length:visible.length}</span></h3></div><div className="section-tools"><DemoFlag demo={showDemoPreview||q.data?.some(w=>w.isDemo)}/><div className="searchbox"><Search size={15}/><input data-testid="input-worker-search" placeholder="Search workers" value={filter} onChange={e=>setFilter(e.target.value)}/></div><button className="solid-button" onClick={()=>{setTemporaryPassword('');setCredentialWorker('');setOpen(true)}}><Users size={15}/> Add worker</button></div></div>{showDemoPreview ? <CompanyWorkerPreviewTable workers={demoVisible}/> : visible.length? <div className="table-scroll"><table className="data-table"><thead><tr><th>Worker</th><th>Role & branch</th><th>Tips received</th><th>Status</th><th>Action</th></tr></thead><tbody>{visible.map((w)=><tr key={w.id}><td><div className="table-person"><WorkerPhotoEditor workerId={w.id} name={w.name} photoUrl={w.photoUrl} companyManaged compact onSaved={()=>void refresh()}/><span><b>{w.name}</b><small dir="ltr">{w.phoneNumber||'No phone number'}</small></span></div></td><td><div><b>{w.role}</b><small>{w.branch||'No branch'}</small></div></td><td className="table-amount">{money(w.totalTipsFils)}</td><td><Badge status={w.status}/></td><td><div className="worker-row-actions">{w.status==='active'&&<button className="outline-button compact" disabled={resetPassword.isPending} onClick={()=>reset({id:w.id,name:w.name})}>Reset password</button>}<button className="outline-button compact" disabled={update.isPending} onClick={()=>update.mutate({workerId:w.id,data:{status:w.status==='active'?'inactive':'active'}},{onSuccess:()=>void refresh()})}>{w.status==='active'?'Pause':'Activate'}</button></div></td></tr>)}</tbody></table></div>:<EmptyPanel title="No team members found" text="Try another name or add your first worker."/>}</section></QueryState>{open&&<div className="modal-backdrop" role="presentation"><div className="modal-card"><button type="button" className="modal-close" onClick={closeModal} aria-label="Close"><X size={17}/></button>{temporaryPassword?<><div className="eyebrow">WORKER LOGIN</div><h2>{language==='ar'?`بيانات دخول ${credentialWorker}`:`Share with ${credentialWorker}`}</h2><p>Give this temporary password to the worker directly. It is shown only once.</p><div className="temporary-password" dir="ltr"><code>{temporaryPassword}</code><button type="button" className="outline-button compact" onClick={()=>void copyPassword()}>{passwordCopied?<Check size={14}/>:<Copy size={14}/>} {passwordCopied?'Copied':'Copy'}</button></div><div className="notice-box"><KeyRound size={16}/><span>The worker signs in with their phone number and changes this password at first sign-in.</span></div><PillButton type="button" onClick={closeModal}>Done <Check size={15}/></PillButton></>:<form onSubmit={submit}><div className="eyebrow">ADD WORKER</div><h2>Add worker</h2><label>Full name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Faisal Al-Rashid"/></label><label>Arabic name <input dir="rtl" value={arabic} onChange={e=>setArabic(e.target.value)} placeholder="الاسم بالعربية"/></label><label>Phone number<input required type="tel" autoComplete="tel" dir="ltr" value={phoneNumber} onChange={e=>setPhoneNumber(e.target.value)} placeholder="+965 5000 0000"/></label><div className="modal-split"><label>Role<input required value={role} onChange={e=>setRole(e.target.value)} placeholder="Barista"/></label><label>Branch<input value={branch} onChange={e=>setBranch(e.target.value)} placeholder="Salmiya"/></label></div>{create.isError&&<div className="form-notice" role="alert">Couldn’t add this worker. Check the phone number and try again.</div>}<PillButton type="submit" disabled={create.isPending}>{create.isPending?'Adding…':'Add worker'} <ArrowUpRight size={15}/></PillButton></form>}</div></div>}</PortalLayout>;
}
function CompanyTransactions() {
  const q=useListCompanyTransactions({query:{queryKey:getListCompanyTransactionsQueryKey()}});
  const dashboard=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey()}});
  const { language }=useLanguage();
  const [search,setSearch]=useState('');
  const showDemoPreview=isEmptyCompanyDashboard(dashboard.data)&&(q.data?.length??0)===0;
  const allTransactions=showDemoPreview?makeCompanyDemoTransactions(language):q.data||[];
  const data=allTransactions.filter(t=>t.workerName.toLowerCase().includes(search.toLowerCase()));
  return <PortalLayout company title="Transactions"><QueryState loading={q.isLoading||dashboard.isLoading} error={q.isError||dashboard.isError} retry={()=>{void q.refetch();void dashboard.refetch()}}>{showDemoPreview&&<DemoPreviewNotice language={language}/>}<section className="surface data-section"><div className="section-heading"><h3>Tip history <span className="subtle-count">{data.length}</span></h3><div className="section-tools"><DemoFlag demo={showDemoPreview||q.data?.some(t=>t.isDemo)}/><div className="searchbox"><Search size={15}/><input placeholder="Search workers" value={search} onChange={e=>setSearch(e.target.value)}/></div>{!showDemoPreview&&<button onClick={()=>downloadCsv(data,'sanad-company-transactions.csv')} className="outline-button"><Download size={15}/> Export</button>}</div></div><TransactionTable transactions={data}/></section></QueryState></PortalLayout>;
}
function CompanyPayouts() {
  const q=useListCompanyPayouts({query:{queryKey:getListCompanyPayoutsQueryKey()}});
  const workers=useListCompanyWorkers({query:{queryKey:getListCompanyWorkersQueryKey()}});
  const dashboard=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey()}});
  const { language }=useLanguage();
  const create=useCreateCompanyPayout();
  const updateStatus=useUpdateCompanyPayoutStatus();
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);const [workerId,setWorkerId]=useState('');const [amount,setAmount]=useState('');const [month,setMonth]=useState(kuwaitMonth);const [note,setNote]=useState('');
  const submit=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{workerId,amountFils:Math.round(Number(amount)*1000),month,note:note||null}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListCompanyPayoutsQueryKey()});void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()});setOpen(false)}})};
  const changeStatus=(payout:PayoutRecord)=>updateStatus.mutate({payoutId:payout.id,data:{status:payout.status==='paid'?'pending':'paid'}},{onSuccess:()=>{void qc.invalidateQueries({queryKey:getListCompanyPayoutsQueryKey()});void qc.invalidateQueries({queryKey:getGetCompanyDashboardQueryKey()})}});
  const showDemoPreview=isEmptyCompanyDashboard(dashboard.data)&&(q.data?.length??0)===0&&(workers.data?.length??0)===0;
  const sampleWorkers=companyDemoWorkers(language);
  const payouts=showDemoPreview?makeDemoPayoutRecords(sampleWorkers.map(w=>({id:w.id,name:w.name})),language):q.data;
  return <PortalLayout company title="Payouts"><QueryState loading={q.isLoading||workers.isLoading||dashboard.isLoading} error={q.isError||workers.isError||dashboard.isError} retry={()=>{void q.refetch();void workers.refetch();void dashboard.refetch()}}>{showDemoPreview&&<DemoPreviewNotice language={language}/>}<div className="payout-toolbar"><span className="compact-note"><ShieldCheck size={15}/> Payroll records only · SANAD does not send bank transfers.</span>{!showDemoPreview&&<button className="solid-button" onClick={()=>setOpen(true)}><Banknote size={15}/> Record payout</button>}</div>{!showDemoPreview&&updateStatus.isError&&<div className="form-notice" role="alert">Could not update this payroll record. Please try again.</div>}<section className="surface data-section"><div className="section-heading"><h3>Payout history <span className="subtle-count">{payouts?.length??0}</span></h3><DemoFlag demo={showDemoPreview||q.data?.some(x=>x.isDemo)}/></div><PayoutList payouts={payouts} empty="Recorded payouts will appear here." onStatusChange={showDemoPreview?undefined:changeStatus} updatingId={updateStatus.isPending ? updateStatus.variables?.payoutId : undefined}/></section></QueryState>{open&&!showDemoPreview&&<div className="modal-backdrop"><form className="modal-card" onSubmit={submit}><button type="button" className="modal-close" onClick={()=>setOpen(false)} aria-label="Close"><X size={17}/></button><div className="eyebrow">PAYROLL RECORD</div><h2>Record a payout</h2><p>Record a payroll payment already handled by your company.</p><label>Worker<select required value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Select a worker</option>{workers.data?.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}</select></label><div className="modal-split"><label>Amount in KWD<input required type="number" min="0.001" step="0.001" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.000"/></label><label>Payroll month<input required type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label></div><label>Note (optional)<textarea maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional reference for this payroll record"/></label>{create.isError&&<div className="form-notice">Could not save payout. Please try again.</div>}<PillButton type="submit" disabled={create.isPending||!workerId}>{create.isPending?'Saving…':'Save payout record'} <ArrowUpRight size={15}/></PillButton></form></div>}</PortalLayout>;
}
function CompanyReports() {
  const { language } = useLanguage();
  const monthState=useState(kuwaitMonth);
  const [month,setMonth]=monthState;
  const q=useGetCompanyReport({month},{query:{queryKey:getGetCompanyReportQueryKey({month}),enabled:!!month}});
  const dashboard=useGetCompanyDashboard({query:{queryKey:getGetCompanyDashboardQueryKey()}});
  const showDemoPreview=isEmptyCompanyDashboard(dashboard.data)&&Boolean(q.data&&q.data.tipsFils===0&&q.data.pendingFils===0&&q.data.paidOutFils===0&&q.data.workerCount===0&&q.data.transactionCount===0);
  const report=showDemoPreview?demoCompanyReport(month):q.data;
  return <PortalLayout company title="Reports"><QueryState loading={q.isLoading||dashboard.isLoading} error={q.isError||dashboard.isError} retry={()=>{void q.refetch();void dashboard.refetch()}}>{showDemoPreview&&<DemoPreviewNotice language={language}/ >}{report&&<section className="surface report-panel"><div className="report-title"><div className="report-icon"><FileText/></div><div><span className="panel-kicker">MONTHLY REPORT</span><h3>{monthName(report.month,language)}</h3></div><label className="month-picker"><span>Month</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><DemoFlag demo={showDemoPreview||report.isDemo}/></div><div className="report-rows"><div><span>Total tips</span><strong>{money(report.tipsFils)}</strong></div><div><span>Pending payroll</span><strong>{money(report.pendingFils)}</strong></div><div><span>Paid out</span><strong>{money(report.paidOutFils)}</strong></div><div><span>Workers</span><strong>{report.workerCount}</strong></div><div><span>Transactions</span><strong>{report.transactionCount}</strong></div></div>{!showDemoPreview&&<button className="outline-button" onClick={()=>downloadCsv([{month:monthName(report.month),tips:money(report.tipsFils),pending:money(report.pendingFils),paidOut:money(report.paidOutFils),workers:report.workerCount,transactions:report.transactionCount}],'sanad-monthly-report.csv')}><Download size={15}/> Download report</button>}</section>}</QueryState></PortalLayout>;
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
  const { language } = useLanguage();
  const localization = language === 'ar'
    ? {
        locale: 'ar',
        socialButtonsBlockButton: 'المتابعة باستخدام {{provider}}',
        dividerText: 'أو',
        formFieldLabel__emailAddress: 'البريد الإلكتروني',
        formFieldLabel__phoneNumber: 'رقم الهاتف',
        formFieldLabel__password: 'كلمة المرور',
        formFieldLabel__firstName: 'الاسم الأول',
        formFieldLabel__lastName: 'اسم العائلة',
        formFieldInputPlaceholder__emailAddress: 'أدخل بريدك الإلكتروني',
        formFieldInputPlaceholder__password: 'أدخل كلمة المرور',
        formFieldAction__forgotPassword: 'هل نسيت كلمة المرور؟',
        formButtonPrimary: 'متابعة',
        backButton: 'رجوع',
        signIn: {
          start: {
            title: 'مرحباً بعودتك',
            subtitle: 'سجّل الدخول إلى حسابك في سند',
            actionText: 'ليس لديك حساب؟',
            actionLink: 'إنشاء حساب',
          },
          password: {
            title: 'أدخل كلمة المرور',
            subtitle: 'أدخل كلمة المرور للمتابعة',
            actionLink: 'استخدام طريقة أخرى',
          },
          forgotPassword: {
            title: 'إعادة تعيين كلمة المرور',
            subtitle: 'اتبع التعليمات لإعادة تعيين كلمة المرور.',
            formTitle: 'إرسال رابط إعادة التعيين',
            resendButton: 'إعادة الإرسال',
          },
          resetPassword: {
            title: 'تعيين كلمة مرور جديدة',
            formButtonPrimary: 'حفظ كلمة المرور',
            successMessage: 'تم تحديث كلمة المرور.',
          },
        },
        signUp: {
          start: {
            title: 'انضم إلى سند',
            subtitle: 'أنشئ حساب شركتك لإدارة فريقك',
            actionText: 'لديك حساب بالفعل؟',
            actionLink: 'تسجيل الدخول',
          },
        },
      }
    : {
        locale: 'en-US',
        signIn: {
          start: { title: 'Welcome back', subtitle: 'Sign in to your SANAD account' },
        },
        signUp: {
          start: { title: 'Join SANAD', subtitle: 'Bring a little more appreciation to your team' },
        },
      };
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={localization} routerPush={(to)=>setLocation(stripBase(to))} routerReplace={(to)=>setLocation(stripBase(to),{replace:true})}>
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
  const [language,setLanguage]=useState<Language>(()=> {
    try { return localStorage.getItem('sanad-language')==='ar'?'ar':'en'; }
    catch { return 'en'; }
  });
  const toggle=()=>setLanguage((prev)=>prev==='en'?'ar':'en');
  useLayoutEffect(()=>{
    document.documentElement.dir=language==='ar'?'rtl':'ltr';
    document.documentElement.lang=language;
    try { localStorage.setItem('sanad-language',language); } catch { /* Keep the selected language for this session. */ }
  },[language]);
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
