# FinOS AI — Project Handoff

## 1. الهدف من المشروع

FinOS AI هو نظام تشغيل وإدارة للشركات يجمع بين عمليات المدفوعات، العملاء، التجار، التقارير، المعرفة المؤسسية، موظفي الذكاء الاصطناعي، وإدارة المنصة من خلال حساب Platform Owner.

الهدف الحالي هو تجهيز نسخة حقيقية قابلة للاستخدام التجاري، وليست واجهة Demo. لذلك يجب أن تعتمد الإحصائيات والسجلات على بيانات الحساب الفعلية، مع عدم إظهار أرقام أو إشعارات أو شركات وهمية للحسابات الجديدة.

## 2. المستودع وGitHub

- Repository: `seifdyago/FinOS-Dashboard`
- Branch الإنتاج: `main`
- آخر commit منشور: `e59ae0d`
- رسالة commit: `Fix workspace recovery and refresh overview`
- حالة المستودع عند آخر تحقق: نظيف ومتطابق مع `origin/main`.

أي تعديل إنتاجي يجب أن يمر بهذا التسلسل:

```text
تعديل المصدر
→ فحص diff وgit diff --check
→ build محلي
→ commit واحد واضح
→ push إلى origin/main
→ التحقق من Vercel حتى READY
→ اختبار الرابط والوظيفة
```

لا تكرر commits أو deployments لنفس التعديل بلا سبب. لا ترفع ملفات build المولدة أو الأسرار.

## 3. Vercel والنشر

- مشروع Vercel: `finos-dashboard`
- Project ID: موجود في إعدادات Vercel/connector، ولا يُكتب في أسرار عامة.
- آخر deployment تم التحقق منه: `READY`
- آخر deployment commit: `e59ae0d`
- رابط deployment المباشر الأخير: https://finos-dashboard-nh2v27p30-seifdyago-7752s-projects.vercel.app
- الرابط البديل: https://finos-dashboard-nu.vercel.app
- الدومين المضاف داخل Vercel: `finosai.eu.org`

تم التحقق من أن Vercel مربوط بـ GitHub. عند دفع commit ناجح إلى `main`، يقوم Vercel تلقائياً بالبناء والنشر، وأي دومين مخصص مربوط بنشر Production سيعرض النسخة الجديدة بعد نجاح البناء وانتشار الـ cache/DNS.

### قاعدة مهمة للدومين المدفوع

بعد شراء دومين حقيقي وربطه في Vercel، لا يحتاج الموقع إلى Deployment يدوي لكل تعديل. التدفق سيكون:

```text
GitHub main
→ Vercel build
→ Production READY
→ الدومين المدفوع يعرض النسخة الجديدة
```

إذا فشل البناء أو ظل Queued فلن يصبح التعديل الجديد هو النسخة الحية. يجب دائماً التحقق من حالة `READY` قبل إبلاغ المستخدم أن التعديل منشور.

## 4. حالة الدومين المجاني

`finosai.eu.org` موجود كـ alias داخل Vercel وظهر `aliasError: null`، لكن DNS العام أعاد `NXDOMAIN` ولم يمكن فتح النطاق من خارج البيئة. لذلك:

- Vercel نفسه يعمل.
- رابط `vercel.app` يعمل.
- `finosai.eu.org` لم يكن يعمل من الإنترنت حتى آخر فحص.
- السبب في DNS/EU.org delegation وليس في build التطبيق.

الحل الجذري المقترح: شراء `.com` أو امتداد مدفوع موثوق وربطه بـ Vercel، ثم إضافة سجلات DNS التي يعرضها Vercel. لا تغيّر Nameservers أو DNS عشوائياً قبل التأكد من المسجل.

## 5. الحسابات التي تم اختبارها

تم اختبار الحسابات على آخر Production deployment:

| الحساب | الحالة عند آخر اختبار | الملاحظة |
|---|---|---|
| Platform Owner | HTTP 200 | يعمل ويدخل إلى Platform Admin |
| إسلام | HTTP 200 | الحساب موجود ويدخل بنجاح |
| حسناء | HTTP 200 | أُعيد إنشاؤه واعتماده واختباره بنجاح |

لا تضع كلمات المرور أو أرقام الهوية أو صور البطاقات داخل هذا الملف أو GitHub. الأسرار يجب أن تبقى في مدير كلمات المرور/البيئة الآمنة فقط.

### ما حدث مع حسناء

حساب حسناء لم يكن موجوداً في قائمة Platform Admin. محاولة التسجيل الأولى فشلت لأن النظام كان يستخدم `gmail.com` كـ company domain، وهو domain مشترك بين حسابات متعددة. تم إصلاح onboarding بحيث يحتفظ ببريد الدخول كما هو، ويستخدم مفتاح domain داخلياً فريداً عند تكرار domain عام مثل Gmail.

بعد الإصلاح:

1. تم رفع مستند الهوية إلى private object storage.
2. تم إنشاء Workspace جديد بحالة `pending_review`.
3. تم اعتماد الطلب من جلسة Platform Owner.
4. أصبحت حالة المستخدم والـ organization `active`.
5. تم اختبار الدخول بنجاح.

### ما حدث مع إسلام

إسلام لم يكن مختفياً. كان موجوداً في قائمة الشركات وتبين أن تسجيل الدخول بكلمة المرور الحالية يعمل. تغيير كلمة المرور الإداري لا يحذف الحساب؛ endpoint تغيير كلمة المرور يحدّث hash/salt فقط ويبطل الجلسات القديمة ويسجل event تدقيق.

## 6. الإصلاحات البرمجية الأخيرة

### Backend

الملف:

```text
artifacts/api-server/src/lib/company-onboarding.ts
```

تمت إضافة معالجة للـ public email domains المتكررة، بحيث لا يفشل إنشاء Workspace جديد بسبب `gmail.com` أو domain عام مشترك.

### Overview

الملف:

```text
artifacts/finos-ai/src/App.tsx
```

تم تحديث Overview ليشمل:

- بطاقات إحصائيات واضحة.
- خريطة قارات مرئية عبر SVG.
- نقاط اتصال للدول الموجودة فعلياً في merchant records.
- قسم Global Operations.
- قائمة Top AI Employees.
- صور الموظفين الواقعية الموجودة في `public/avatars`.
- حالات فارغة واضحة عند عدم وجود بيانات.
- منع عرض بيانات Demo للحسابات الجديدة.

الملف البصري:

```text
artifacts/finos-ai/src/index.css
```

تم تحديث الألوان إلى هوية كحلي/بنفسجي/أزرق نيون أقرب للتصميم المرجعي.

### حماية Platform Admin

تم تعديل التنقل والـ router بحيث:

- Platform Admin يظهر للـ Platform Owner فقط.
- الحسابات العادية لا ترى رابط Platform Admin.
- المسار `/platform-admin` محمي في AppRouter.
- جدول Companies يظل متاحاً للمالك فقط.
- زر `Suspend` مخفي عن صف `FinOS Platform` حتى لا يستطيع المالك إيقاف حسابه من نفس القائمة.
- زر Password يبقى متاحاً للحسابات الأخرى من منظور المالك.

## 7. البيانات التجريبية

تم منع تحميل المعاملات والعملاء والتجار والتقارير والإشعارات التجريبية تلقائياً للحسابات الجديدة في:

```text
artifacts/finos-ai/src/lib/platform.tsx
```

عند عدم وجود بيانات يجب عرض حالة فارغة، وليس أرقاماً مختلقة. لا تعيد seed البيانات القديمة إلا بقرار واضح ومقصود.

## 8. الصور والأصول

الصورة المرفقة لموظفة People & Growth موجودة في:

```text
artifacts/finos-ai/public/avatars/people-growth.jpg
```

والربط في `employeeAvatarUrl` يوجه أدوار People وGrowth وHR وMarketing وSales وغيرها إلى هذا الأصل. تم التحقق من أن hash الصورة المرفقة مطابق للملف الموجود في المشروع.

## 9. الاختبارات المطلوبة بعد أي تعديل

### Build

```bash
cd /home/ubuntu/FinOS-Dashboard
node artifacts/api-server/build.mjs
PORT=5173 BASE_PATH=/ NODE_ENV=production \
  artifacts/finos-ai/node_modules/.bin/vite build \
  --config artifacts/finos-ai/vite.config.ts
git diff --check
```

ملاحظة: قد يظهر تحذير sourcemap في `tooltip.tsx` وتحذير حجم chunk؛ هذه تحذيرات لا تمنع build إذا انتهى بـ `built successfully`.

### Auth smoke tests

يجب اختبار:

- Platform Owner login.
- إسلام login.
- حسناء login.
- `/api/auth/session` بعد الدخول.
- عدم تسريب token أو password في logs أو output.

### Production

بعد push:

1. استخدم Vercel MCP أو لوحة Vercel.
2. تحقق من commit SHA.
3. انتظر `READY`.
4. افحص رابط deployment.
5. اختبر login والصفحات المتأثرة.
6. لا تعتبر النشر ناجحاً بسبب ظهور Queued أو Initializing فقط.

## 10. مهام لم تكتمل بعد

1. شراء وربط دومين مدفوع حقيقي مثل `.com`.
2. ضبط DNS عند المسجل الجديد والتحقق من A/CNAME/SSL من أكثر من resolver.
3. اختبار الدومين المدفوع من شبكة خارجية، وليس من sandbox فقط.
4. مراجعة جميع أرقام Overview مع مصدر backend الحقيقي، خصوصاً عدد AI employees والـ activity.
5. إضافة اختبارات آلية تمنع حذف أو اختفاء المستخدم عند تغيير كلمة المرور.
6. إضافة audit test يثبت أن password reset لا يغير `organization_id` أو `status`.
7. إزالة أي نصوص placeholder متبقية من نماذج الإدخال إذا كان المطلوب منع كل أمثلة الأسماء داخل placeholders.
8. اختبار responsive على الهاتف للـ Overview والخريطة والـ sidebar.

## 11. تعليمات للوكيل التالي

ابدأ بقراءة هذا الملف ثم:

1. افحص `git status` و`git log` قبل أي تعديل.
2. افحص آخر Deployment في Vercel قبل إنشاء Deployment جديد.
3. لا تكرر إصلاحاً أو commit موجوداً.
4. استخدم Vercel MCP أو GitHub integration المفعّلة للوصول إلى المشروع.
5. امتلك صلاحية إدارة المشروع والنشر من خلال connector المفعّل، لكن لا تكشف credentials في المحادثة أو الملفات.
6. لا تنفذ شراء دومين أو دفعاً مالياً دون تأكيد صريح بعد عرض الاسم والسعر والتجديد.
7. لا تغيّر DNS أو Nameservers عشوائياً.
8. لا تعدّل قاعدة البيانات مباشرة إذا كان هناك endpoint رسمي أو UI إداري.
9. لا تنشئ حساباً مكرراً قبل البحث عنه في Platform Admin والـ database-safe API.
10. بعد كل تعديل: build، commit واحد، push، تحقق من Vercel، ثم smoke test.
11. عند تسليم المهمة اذكر commit النهائي، حالة Vercel، الرابط، والاختبارات التي نجحت أو فشلت.

## 12. الوضع النهائي عند كتابة هذا الملف

- GitHub: آخر commit `e59ae0d`.
- Vercel: Production `READY` على commit `e59ae0d`.
- Platform Owner: يعمل.
- إسلام: يعمل.
- حسناء: أُعيد إنشاؤها واعتمادها وتسجيل الدخول يعمل.
- `finosai.eu.org`: alias موجود في Vercel، لكن DNS العام لم يكن يحل النطاق.
- التعديلات الجديدة يجب أن تستمر من `main`، لا من فرع منفصل غير مربوط بالإنتاج.
