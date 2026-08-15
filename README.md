# אתר תיק העבודות של לוטם שיפנבאור

אתר סטטי — HTML5 סמנטי ו-CSS3 טהור, בלי פריימוורקים ובלי שלב build.
דו-לשוני (עברית RTL / אנגלית LTR) עם מתג החלפה.

- **[PLAN.md](PLAN.md)** — תוכנית הבנייה, הפלטה, הטיפוגרפיה ומפת הדף
- **[PHOTOS.md](PHOTOS.md)** — מה לשים בתיקיית התמונות

## מבנה

```
index.html          כל הדף
css/
  fonts.css         @font-face — נוצר אוטומטית, אין לערוך ידנית
  base.css          reset, משתני עיצוב, טיפוגרפיה
  layout.css        מקטעים, גרידים, מוזאיקה
  components.css    מתג שפה, משבצות תמונה, נגנים, טבלת קשר
js/
  lang.js           וילון המעבר בין השפות
  ui.js             רצף פתיחה, התאמת כותרות, לייטבוקס, נגנים, dock, סרגל
content/
  strings.json      כל הטקסטים, שתי השפות — המקור היחיד
he/index.html       נוצר אוטומטית
404.html            נוצר אוטומטית מ-404.src.html
assets/
  fonts/            4 פונטים משתנים, מתארחים מקומית (80KB)
  photos/           תמונות המאסטר — לא מוגשות
  img/              הגרסאות הרספונסיביות שנוצרות — אלו שמוגשות
  video/            הסרטונים
build-images.py     מייצר את assets/img מתוך assets/photos
old/                פרויקט React הקודם — גיבוי בלבד, לא חלק באתר
```

## הרצה מקומית

אין תלויות ואין התקנה. צריך רק שרת סטטי כלשהו כדי שהדפדפן יטען את
קבצי ה-CSS וה-JS (פתיחה ישירה של `index.html` מהדיסק תחסום אותם):

```bash
python3 -m http.server 5173
```

ואז לפתוח `http://localhost:5173`.

## פריסה ל-AWS S3

### פעם ראשונה

```bash
aws s3 mb s3://lotem-portfolio-site --region il-central-1
```

```bash
aws s3 website s3://lotem-portfolio-site --index-document index.html --error-document index.html
```

### כל העלאה

בלי שלב build — הקבצים באתר הם הקבצים שעולים:

```bash
aws s3 sync . s3://lotem-portfolio-site --delete --exclude "old/*" --exclude "*.md" --exclude ".claude/*" --exclude ".git/*" --exclude "assets/video/source/*" --exclude "assets/photos/*" --exclude "*.py"
```

> שני ה-`--exclude` הראשונים **קריטיים**:
> `assets/video/source` מחזיק 3.2GB של קבצי מצלמה, ו-`assets/photos` מחזיק את
> תמונות המאסטר. שניהם לא מוגשים לאתר — האתר מגיש רק את `assets/img/`.
> בלי ההחרגות הם יעלו ל-S3 ויעלו לך כסף בלי שאף אחד יראה אותם.

אם מוגדר CloudFront, לרוקן את המטמון אחרי כל העלאה:

```bash
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

### CloudFront (מומלץ — HTTPS, מהירות, דומיין אישי)

1. מסוף AWS → **CloudFront** → **Create Distribution**
2. Origin: ה-bucket, דרך **Origin Access Control** — כך הבאקט נשאר פרטי ורק
   CloudFront ניגש אליו
3. Default root object: `index.html`
4. Viewer protocol policy: **Redirect HTTP to HTTPS**

לדומיין אישי: תעודה ב-**Certificate Manager** (חובה ב-`us-east-1` עבור CloudFront),
חיבור התעודה ל-Distribution תחת Alternate domain names, ורשומת ALIAS ב-Route 53.

## עדכון תוכן

כל הטקסטים באתר יושבים ב-[js/i18n.js](js/i18n.js), בשני מילונים — `he` ו-`en`.
שינוי טקסט נעשה שם, במקום אחד, ולא ב-HTML.

## לפני העלייה לאוויר — שני דברים שדורשים דומיין

בראש `index.html` יש הערת `TODO`. ברגע שיש דומיין:

1. להפוך את `og:image` לכתובת מוחלטת (`https://הדומיין/assets/og-image.jpg`).
   רוב מציגי הקישורים לא פותרים נתיב יחסי, ובלי זה שיתוף בוואטסאפ יופיע בלי תמונה.
2. להוסיף `<link rel="canonical">` ו-`<meta property="og:url">`.

באותו מקום כבר מוגדרים: תיאור, Open Graph, Twitter card, `hreflang` לשתי השפות,
אייקון, ו-JSON-LD מסוג `ProfessionalService` הכולל את רישיון הרחפן — זה מה
שעוזר בחיפוש מקומי.

## שתי שפות, שתי כתובות

| כתובת | שפה |
|---|---|
| `/` | אנגלית |
| `/he/` | עברית |

**שני עמודי HTML נפרדים, לא החלפה בדפדפן.** זחלן שמבקש את העמוד העברי מקבל
HTML עברי — קודם שתי הכתובות החזירו אנגלית והחצי העברי של האתר היה בלתי נראה
לחיפוש. מתג השפה הוא קישור אמיתי ועובד גם בלי JavaScript; הסקריפט רק מוסיף
את הווילון לפני המעבר.

### עריכת טקסטים

כל הטקסטים יושבים ב-**[content/strings.json](content/strings.json)** — מילון
אחד לשתי השפות. אחרי כל עריכה:

```bash
python3 build-pages.py
```

זה מייצר מחדש את `index.html`, `he/index.html` ו-`404.html`. **אל תערוך את
קבצי ה-HTML ישירות** — הם נדרסים בכל בנייה. שינויים במבנה כן נעשים ב-`index.html`,
שהוא גם התבנית וגם העמוד האנגלי.

## הפונטים

`css/fonts.css` ו-`assets/fonts/` נוצרים אוטומטית ואין לערוך אותם ידנית.
שתי משפחות משתנות — **Rubik** לכל הכותרות ו-**Assistant** לטקסט — בתת-קבוצות
עברית ולטינית בלבד. 80KB סה"כ.

## לפני כל העלאה

```bash
python3 preflight.py
```

בודק מבנה, קבצים חסרים, משתני CSS, נגישות, כפילות מזהים, קישורי ניווט,
סנכרון בין שתי השפות, ואיות השם. **וגם שכבות צפות שמכסות את המסך בלי להיחסם**
— באג כזה שיתק פעם את כל הלחיצות באתר.

## תמונות — יש שלב בנייה

זה השתנה. יש עכשיו שתי תיקיות:

| תיקייה | מה יש בה | מוגש לאתר? |
|---|---|---|
| `assets/photos/` | תמונות המאסטר שאתה מפיל | **לא** |
| `assets/img/` | הגרסאות שנוצרות — 6 רוחבים × WebP ו-JPG | כן |

אחרי כל הוספה או החלפה של תמונה ב-`assets/photos/`:

```bash
python3 build-images.py
```

הדפדפן בוחר לבד את הרוחב והפורמט המתאימים. **התוצאה: טלפון מוריד 1.9MB במקום 12MB.**

אם הוספת משבצת חדשה (ולא רק החלפת קיימת), צריך גם להוסיף לה בלוק `<picture>`
ב-`index.html`. תגיד לי ואני אעשה.

## סרטונים

קבצי המקור מהמצלמה יושבים ב-`assets/video/source/` ו**לא עולים לאתר**.
מה שהאתר מגיש הוא `assets/video/*.mp4` — גרסאות 1080p בערך 5 Mbps,
עם `+faststart` כדי שההשמעה תתחיל לפני שהקובץ ירד במלואו.

להוספת סרטון חדש: לשים את המקור ב-`source/` ולהריץ המרה. שים לב לשתי מלכודות
שנתקלנו בהן:

1. **דגל סיבוב.** ה-DJI Mavic 4 Pro כותב `rotation of -90` לקבצים אנכיים.
   חובה `-map 0:v:0` מפורש, אחרת ffmpeg לוקח את יחס הממדים מתמונת הכריכה
   המוטמעת ומייצר וידאו מעוות.
2. **קבצי DJI מכילים זרמי מידע נוספים** (`djmd`, `dbgi`). `-map 0:v:0 -map "0:a?"`
   מוריד אותם.

```bash
ffmpeg -i "source/CLIP.MP4" -map 0:v:0 -map "0:a?" -vf "scale=w=1920:h=1080:force_original_aspect_ratio=decrease,setsar=1" -c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart out.mp4
```
