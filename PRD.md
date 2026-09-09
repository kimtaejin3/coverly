# AI Cover Web Service — MVP PRD

## 1. Product Overview

### Product Name

Working title:

`Coverly`

실제 이름은 추후 변경 가능.

### Product Description

사용자가 음원을 업로드하고 원하는 AI Voice를 선택하면, 원곡의 보컬을 AI Voice로 변환하여 새로운 AI Cover를 생성하는 웹서비스.

첫 사용자는 30초 미리보기를 무료로 생성할 수 있다.

결과가 만족스러우면 전체 곡을 유료로 생성할 수 있다.

사용자가 공개를 허용한 결과물은 Explore 페이지에 노출되어 다른 사용자들이 듣고 동일한 Voice를 이용해 자신의 Cover를 생성할 수 있다.

### Core Value Proposition

> AI Cover를 설치나 복잡한 설정 없이 웹에서 바로 만들어본다.

### Product Positioning

기존 AI Cover 서비스와 모델 성능으로 경쟁하지 않는다.

핵심 차별점:

1. 매우 간단한 UX
2. 무료 preview
3. AI Cover 결과를 구경할 수 있는 Explore
4. 결과물을 SNS에 공유하기 쉬움
5. 모바일 중심 사용성

---

## 2. MVP Goal

MVP의 목적은 다음 가설을 검증하는 것이다.

> 무료 AI Cover를 사용한 사용자가 결과물에 만족했을 때 전체 곡 생성에 비용을 지불하는가?

그리고 두 번째 가설:

> 다른 사람들이 만든 AI Cover를 듣는 것 자체가 서비스 재방문과 신규 생성으로 이어지는가?

### Primary KPI

MVP에서 가장 중요한 지표:

```text
무료 생성 사용자 → 유료 생성 전환율
```

초기 목표:

```text
Free Preview → Paid Full Cover

3% 이상: 가능성 있음
5% 이상: 좋은 신호
10% 이상: 매우 강한 신호
```

### Secondary KPI

```text
Landing → Create 진입률
Create → Free Generate 완료율
Free Generate → Signup 완료율
Free → Paid 전환율
Result → Share 클릭률
Explore → Create 클릭률
AI Generation 실패율
평균 GPU cost / generation
```

---

## 3. Target User

### Primary User

18~35세

AI 콘텐츠에 관심 있는 사용자.

특히:

```text
K-pop / 음악 팬
AI 콘텐츠 소비자
TikTok / Instagram Reels 사용자
AI Voice Cover에 관심 있는 사용자
AI 콘텐츠를 SNS에 공유하는 사용자
```

### User Motivation

사용자는 전문적인 음악 제작을 원하는 것이 아니다.

사용자의 핵심 욕구:

> "이 목소리로 이 노래를 부르면 어떻게 들릴까?"

즉 음악 제작 도구보다 **엔터테인먼트 서비스**에 가깝게 설계한다.

---

## 4. Legal / Content Policy Requirement

중요:

MVP에서는 특정 실존 유명인의 음성을 무단으로 제공하는 것을 제품의 기본 기능으로 만들지 않는다.

지원 Voice:

```text
1. 서비스가 사용 권리를 확보한 Voice
2. 직접 제작한 fictional Voice
3. 사용자가 본인 음성을 업로드하여 만든 Voice
4. 명시적으로 사용 허가된 Voice
```

곡 역시 사용자가 업로드 시 다음 내용에 동의하도록 한다.

```text
본인은 업로드한 콘텐츠를 처리할 권한이 있으며,
서비스 이용으로 인해 발생하는 권리 침해에 대한 책임이 있음을 확인합니다.
```

MVP에는 신고 기능 또는 takedown contact 이메일을 제공한다.

---

## 5. User Flow

### Flow A — First Visit

```text
Instagram Reel / Search / Direct Link
↓
Landing Page
↓
"AI Cover 만들기"
↓
Song Upload
↓
Voice 선택
↓
30초 구간 선택
↓
Generate
↓
무료 Preview 생성
↓
Result
↓
"전체 곡 생성하기"
↓
Signup / Login
↓
Payment
↓
Full Cover Generation
↓
Result
↓
Download / Share
```

---

## 6. Landing Page

Route:

```text
/
```

### Hero

Headline:

> 좋아하는 노래를 새로운 목소리로.

Subheadline:

> 음원을 올리고 Voice를 선택하세요.  
> 30초 AI Cover를 무료로 만들어볼 수 있습니다.

Primary CTA:

```text
무료로 만들어보기
```

Secondary CTA:

```text
다른 Cover 구경하기
```

### Landing Demo

3~6개의 공개 AI Cover card를 보여준다.

Card:

```text
Cover Thumbnail
Song Title
Voice Name
Play Button
♥ Like Count
[이 Voice로 만들어보기]
```

---

## 7. Create Page

Route:

```text
/create
```

사용자가 AI Cover를 생성하는 핵심 페이지.

### Step 1 — Upload

지원:

```text
MP3
WAV
M4A
```

MVP maximum file size:

```text
50MB
```

Maximum duration:

```text
5 minutes
```

UI:

```text
파일을 업로드하세요

Drag & Drop

또는

[파일 선택]
```

---

## 8. Preview Section Selection

파일 업로드 후 waveform 또는 간단한 range selector를 표시한다.

무료 사용자는:

```text
30 seconds
```

길이만 선택 가능.

예:

```text
01:00 ━━━━━━━━━━ 01:30
```

Default:

```text
곡의 30초~60초 구간
```

단, 가능하다면 사용자가 직접 시작점을 선택할 수 있도록 한다.

---

## 9. Voice Selection

Voice 카드 표시.

예:

```text
Voice A
Male / Warm / Ballad

Voice B
Female / Bright / Pop

Voice C
Male / Low / R&B
```

각 Voice마다 sample playback 제공.

Voice Card:

```text
Avatar
Voice Name
Tags

▶ Sample

[Select]
```

MVP Voice count:

```text
3~10개
```

처음부터 수백 개를 제공하지 않는다.

---

## 10. Generate Preview

사용자가:

```text
Song
+
30 sec section
+
Voice
```

를 선택하면 CTA:

```text
무료로 생성하기
```

클릭.

---

## 11. Authentication Strategy

처음부터 로그인하게 만들지 않는다.

추천 흐름:

```text
Upload
↓
Voice 선택
↓
Generate 클릭
↓
이메일 또는 Google Login
↓
Generation 시작
```

이유:

사용자가 먼저 제품의 가치를 이해한 뒤 로그인하도록 한다.

Auth:

```text
Google OAuth
Email Magic Link
```

MVP에서는 Google OAuth만 있어도 충분.

---

## 12. Free Generation Policy

신규 사용자:

```text
30초 AI Cover 1회 무료
```

Free generation 제한:

```text
30초
Standard Quality
Normal Queue
Public result by default
1 free generation per account
```

설정에서 공개 여부를 표시하되, 무료 버전은 공개가 기본값이다.

---

## 13. Anti-Abuse

무료 generation abuse 방지를 위해:

```text
Account ID
IP
Device fingerprint / browser identifier
```

를 기반으로 rate limit 적용.

최소 구현:

```text
user_id 기준 free generation = 1
IP 기준 24시간 최대 3 account free generations
```

심각한 abuse가 발견되기 전까지 지나치게 복잡하게 만들지 않는다.

---

## 14. Generation Status

AI 작업은 synchronous HTTP 요청으로 처리하지 않는다.

반드시 async job 형태.

Status:

```text
QUEUED
PROCESSING
COMPLETED
FAILED
```

UX:

```text
AI Cover를 만들고 있어요.

현재 4번째 순서입니다.

예상 시간
약 2~5분
```

가능하다면 progress 표시.

```text
보컬 분리 중...
Voice 변환 중...
음원 합성 중...
```

---

## 15. AI Processing Pipeline

기본 pipeline:

```text
Original Audio
↓
FFmpeg trim
↓
Demucs
(source separation)
↓
vocals.wav
instrumental.wav
↓
Voice Conversion Model
↓
converted_vocals.wav
↓
FFmpeg
↓
Mix
↓
final_cover.mp3
```

---

## 16. Source Separation

Recommended:

```text
Demucs
```

Preview mode에서는 먼저 30초 구간을 trim한 후 Demucs 처리.

절대 전체 곡을 먼저 분리한 후 30초를 자르지 않는다.

이유:

GPU 비용 절감.

Flow:

```text
Original 4 min song
↓
30 sec trim
↓
Demucs
```

---

## 17. Voice Conversion

초기 후보:

```text
Seed-VC
```

또는 성능 검증 결과에 따라:

```text
RVC
```

MVP에서는 inference layer를 abstraction한다.

Example:

```text
VoiceConversionProvider
```

interface:

```typescript
interface VoiceConversionProvider {
  convert(input: {
    vocalPath: string
    voiceId: string
    pitchShift?: number
  }): Promise<string>
}
```

향후 모델 교체가 쉬워야 한다.

---

## 18. GPU Architecture

Frontend / API server에서 AI model을 직접 실행하지 않는다.

Architecture:

```text
Next.js
↓
Supabase / API
↓
Generation Job
↓
GPU Worker
↓
Demucs
Seed-VC
FFmpeg
↓
Object Storage
↓
DB update
↓
Frontend result
```

---

## 19. Cloud GPU

초기에는 Serverless GPU 또는 GPU instance provider를 이용한다.

후보:

```text
Modal
RunPod
Replicate
Vast.ai
```

MVP의 목적은 가장 저렴한 GPU를 찾는 것이 아니라:

```text
개발 편의성
Cold start
Inference time
실제 generation cost
```

를 측정하는 것이다.

반드시 다음 데이터를 저장한다.

```text
GPU type
GPU processing seconds
total processing seconds
model inference seconds
cost estimate
audio duration
```

---

## 20. Cost Tracking

매 generation마다 비용 추적.

Table:

```text
generation_metrics
```

fields:

```text
generation_id
audio_duration_seconds
gpu_type
gpu_seconds
separation_seconds
voice_conversion_seconds
mixing_seconds
estimated_gpu_cost
created_at
```

### 핵심 지표

```text
cost_per_preview
cost_per_full_cover
```

목표:

무료 30초 Preview:

```text
가능하면 100원 이하
```

Full Cover:

```text
판매 가격 대비 원가율 20% 이하 목표
```

초기에는 더 높아도 괜찮다.

---

## 21. Pricing

MVP에서는 Subscription을 만들지 않는다.

Pay-per-generation만 사용.

Recommended starting pricing:

```text
30 sec Preview
첫 1회 무료
```

Full Cover:

```text
1 Credit
= Full Cover 1곡
```

가격 테스트 시작점:

```text
1곡
₩2,900

3곡
₩6,900

10곡
₩19,900
```

실제 GPU 원가 측정 후 변경 가능하도록 DB 기반으로 관리한다.

---

## 22. Credit System

User:

```text
credit_balance
```

Payment 성공 시 credit 추가.

예:

```text
₩2,900
→ 1 credit

₩6,900
→ 3 credits

₩19,900
→ 10 credits
```

Full Cover generation:

```text
credit_balance - 1
```

---

## 23. Payment

한국 사용자 대상 MVP라면 PG provider abstraction을 만든다.

예:

```text
Toss Payments
```

Payment 성공 후 반드시 server-side validation을 수행한다.

Client callback만 믿지 않는다.

---

## 24. Result Page

Route:

```text
/c/[coverId]
```

구성:

```text
Cover Artwork
Song Title
Voice Name
▶ Player
♡ Like
[이 Voice로 만들어보기]
[Download]
[Share]
```

Free Preview:

```text
전체 곡 만들어보기
₩2,900
```

CTA를 크게 표시.

---

## 25. Explore

Route:

```text
/explore
```

Public Cover Feed.

MVP sorting:

```text
Trending
Latest
```

Card:

```text
Artwork
Song title
Voice
▶
♡ likes
Creator
[이 Voice로 만들기]
```

---

## 26. Explore Growth Loop

가장 중요한 Product Loop.

```text
User A Cover 생성
↓
Public Explore 등록
↓
User B가 Cover 청취
↓
"이 Voice로 만들어보기"
↓
Create page
↓
User B Cover 생성
↓
Explore 등록
```

이 loop가 서비스의 핵심 성장 구조다.

---

## 27. Share

Result page에서:

```text
Copy Link
Instagram 공유 안내
Download Audio
```

MVP 이후:

자동 Reel Video 생성 기능 추가 가능.

예:

```text
9:16

Cover Artwork
Song title
AI Voice name
Animated waveform
Generated with Coverly
```

하지만 **MVP에서는 만들지 않는다.**

---

## 28. Likes

Explore에서는 로그인 사용자만 Like 가능.

DB:

```text
cover_likes
```

Unique:

```text
(user_id, cover_id)
```

---

## 29. Comments

MVP 제외.

---

## 30. Follow System

MVP 제외.

---

## 31. Creator Profile

MVP 제외 또는 매우 단순 구현.

Optional:

```text
/u/[username]
```

표시:

```text
username
created covers
```

---

## 32. Database

Supabase PostgreSQL.

### users

```sql
id
email
username
avatar_url
credit_balance
free_generation_used
created_at
```

### voices

```sql
id
name
description
gender
tags
sample_url
thumbnail_url
model_reference
is_active
created_at
```

### covers

```sql
id
user_id
voice_id

title

original_file_url
preview_start_seconds
preview_duration_seconds

result_url

type
-- preview / full

status
-- queued / processing / completed / failed

visibility
-- public / private

like_count

created_at
completed_at
```

### generation_jobs

```sql
id
cover_id

status

queue_position

worker_id

error_message

started_at
completed_at
created_at
```

### generation_metrics

```sql
id
generation_id

audio_duration_seconds

gpu_type

gpu_seconds

separation_seconds

voice_conversion_seconds

mixing_seconds

estimated_gpu_cost

created_at
```

### payments

```sql
id
user_id

provider
provider_payment_id

amount

credits

status

created_at
```

### credit_transactions

```sql
id

user_id

type
-- purchase / generation / refund / bonus

amount

reference_id

created_at
```

### cover_likes

```sql
user_id
cover_id
created_at
```

Unique composite key:

```sql
(user_id, cover_id)
```

---

## 33. Storage

Files:

```text
original audio
trimmed audio
separated vocal
instrumental
converted vocal
final output
```

임시 processing 파일은 worker local storage에 저장.

영구 Storage에는 최소한:

```text
Original
Final result
```

만 저장.

중간 파일:

```text
vocals.wav
instrumental.wav
converted.wav
```

는 작업 완료 후 삭제.

---

## 34. Storage Retention

무료 Preview original:

```text
7일 후 삭제 가능
```

Free result:

```text
30일
```

Paid result:

```text
장기 보관
```

MVP에서 정확한 retention 정책은 config로 관리.

---

## 35. Frontend Stack

Recommended:

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
```

Mobile-first.

Instagram 유입이 많을 것이므로 모바일 UX를 우선한다.

Target viewport:

```text
390px
```

desktop은 responsive.

---

## 36. Backend

Recommended:

```text
Next.js API Routes / Server Actions
Supabase
PostgreSQL
Supabase Auth
```

AI Worker:

```text
Python
```

---

## 37. Repository Structure

권장 구조:

```text
/apps

  /web
    Next.js

  /worker
    Python GPU worker

/packages

  /shared
  /types
```

예:

```text
coverly/

apps/
  web/
  worker/

packages/
  shared/
```

---

## 38. Job Processing

API:

```text
POST /api/covers
```

flow:

```text
validate
↓
upload
↓
create cover
↓
create generation_job
↓
GPU worker picks job
↓
process
↓
upload result
↓
update cover
↓
notify frontend
```

Frontend는:

```text
Supabase realtime
```

또는 polling.

MVP에서는 polling도 충분.

예:

```text
GET /api/covers/:id/status
```

5초마다 호출.

---

## 39. Job Failure

Worker failure 발생 시:

```text
status = failed
```

무료 generation:

다시 시도 가능.

Paid generation:

```text
사용한 credit 자동 refund
```

한다.

---

## 40. Analytics

초기부터 반드시 넣는다.

추천:

```text
PostHog
```

또는 equivalent.

Events:

```text
landing_view
create_click
song_uploaded
voice_selected
preview_generate_click
signup_completed
preview_generated
preview_played
full_cover_click
payment_started
payment_completed
full_cover_generated
share_clicked
explore_view
explore_cover_play
explore_create_click
```

---

## 41. Admin

MVP Admin은 별도 dashboard까지 만들 필요 없음.

Supabase Dashboard로 관리 가능.

단 아래 정도는 간단한 `/admin`에서 제공해도 좋음.

```text
Generations today
Failed generations
GPU estimated cost
Revenue
Free → Paid conversion
```

---

## 42. Safety

업로드 파일 검증:

```text
MIME type
extension
file size
audio duration
```

파일명 직접 신뢰하지 않는다.

User-generated HTML 없음.

Storage URL access control 적용.

---

## 43. Moderation

Cover 신고 기능:

```text
신고
```

사유:

```text
저작권 침해
음성 권리 침해
불쾌한 콘텐츠
기타
```

Admin은 신고된 cover를:

```text
Hide
Delete
```

가능.

---

## 44. MVP Design Philosophy

UI는 음악 제작 프로그램처럼 만들지 않는다.

복잡한 설정 금지.

사용자가 해야 하는 것은 오직:

```text
1. 노래 넣기
2. Voice 고르기
3. Generate
```

이다.

Pitch / index / model strength / noise / filter 등의 advanced parameter는 MVP에서 숨긴다.

---

## 45. Mobile UX

Instagram Reel → 서비스 진입이 핵심이기 때문에 모든 핵심 기능은 스마트폰에서 가능해야 한다.

특히:

```text
Upload
Voice 선택
Generate
Audio playback
Payment
Share
```

모두 모바일 최적화.

---

## 46. MVP Scope

반드시 구현:

```text
Landing
Google Login
Audio upload
30 sec selection
Voice selection
Free Preview generation
GPU job queue
AI pipeline
Result
Full Cover payment
Credit
Explore
Likes
Share link
Generation metrics
```

---

## 47. Explicitly NOT MVP

절대 초기 구현하지 말 것:

```text
Comments
Followers
DM
Playlist
Creator monetization
Subscription
Advanced audio editing
Voice marketplace
Voice training UI
AI music generation
Mobile app
Auto Reel generation
Recommendation algorithm
Notifications
```

사용자가 충분히 생긴 뒤 추가한다.

---

## 48. Development Order

Claude Code는 다음 순서로 구현한다.

### Phase 0

AI pipeline PoC.

먼저 웹사이트를 만들지 말 것.

실제:

```text
audio.mp3
↓
30 sec trim
↓
Demucs
↓
Voice Conversion
↓
Mix
↓
output.mp3
```

가 성공하는 것을 먼저 확인한다.

10개 샘플을 테스트한다.

합격 기준:

```text
10개 중 최소 7개가 서비스에 공개해도 될 정도의 결과
```

### Phase 1

Frontend mock.

```text
Landing
Create
Result
Explore
```

실제 AI 없이 mock 데이터로 UX 완성.

### Phase 2

Supabase.

```text
Auth
DB
Storage
```

### Phase 3

GPU worker.

```text
generation_jobs
↓
worker
↓
result upload
```

연동.

### Phase 4

Free Preview.

실제 end-to-end:

```text
Instagram 사용자
↓
upload
↓
generate
↓
listen
```

완성.

### Phase 5

Payment.

```text
credit purchase
↓
full generation
```

### Phase 6

Explore.

```text
public covers
↓
listen
↓
reuse voice
```

### Phase 7

Analytics & Cost tracking.

---

## 49. Initial Success Criteria

런칭 후 첫 30일 목표:

```text
Users
500+

Free generations
200+

Paid users
10+

Free → Paid conversion
5% 목표

Public covers
100+

Share click rate
10%+

Generation success rate
95%+

GPU cost measured for 100% jobs
```

매출 자체보다 conversion 검증이 우선.

---

## 50. Unit Economics

반드시 다음 계산이 가능해야 한다.

```text
Revenue per paid generation
-
Payment fee
-
GPU inference cost
-
Storage / bandwidth
=
Contribution margin
```

예:

```text
판매가
2,900원

GPU
300원

PG
100원

Storage etc.
50원

-----------------

Contribution
2,450원
```

실제 수치는 inference benchmark 이후 결정한다.

목표:

```text
GPU cost ≤ 판매가의 20%
```

---

## 51. Instagram Growth Strategy

서비스 자체와 콘텐츠를 동시에 만든다.

인스타 계정:

`developesebal`

포지셔닝:

> AI로 실제 서비스를 만들어보는 개발자.

런칭 전부터 Build in Public 콘텐츠 제작.

콘텐츠 예:

```text
"AI 커버 사이트들이 다 유료길래 직접 만들어봅니다"
↓
Day 1
AI Cover가 실제로 만들어질까?
↓
Day 2
30초 생성 성공
↓
Day 3
웹사이트 만들어봄
↓
Day 5
무료 공개
↓
Day 7
실제 사용자 수 공개
↓
Day 14
무료 사용자 중 몇 명이 돈 냈을까?
↓
Day 30
AI 서비스 한 달 매출 공개
```

서비스 마케팅과 개발 인스타 성장을 동시에 진행한다.

---

## 52. Product Growth Loop

최종적으로 반드시 아래 구조를 목표로 한다.

```text
Instagram Reel
↓
Website
↓
Free Cover
↓
Result
↓
Share
↓
Instagram / Social
↓
New User
↓
Free Cover
```

그리고 내부적으로:

```text
Explore
↓
Interesting Cover
↓
Use Same Voice
↓
New Cover
↓
Explore
```

두 개의 loop를 만든다.

---

## 53. Technical Principle

Claude Code가 구현 시 다음 원칙을 지킨다.

```text
Do not over-engineer.

Prefer boring and maintainable architecture.

AI model must be replaceable.

GPU provider must be replaceable.

Payment provider must be replaceable.

All generation costs must be measurable.

Never block HTTP request while GPU inference runs.

All paid jobs must be recoverable.

Never lose user credits due to generation failure.
```

---

## 54. First Technical Task

**이 PRD를 받은 뒤 바로 웹 UI부터 구현하지 말 것.**

가장 먼저 `/apps/worker`에서 command-line PoC를 작성한다.

CLI:

```bash
python generate.py \
  --input ./sample.mp3 \
  --voice ./voices/sample.wav \
  --start 60 \
  --duration 30 \
  --output ./output.mp3
```

Expected pipeline:

```text
Trim
→ Separate
→ Voice Convert
→ Mix
→ MP3
```

그리고 다음 정보를 출력한다.

```text
Input duration
Trim time
Separation time
Voice conversion time
Mixing time
Total time
Peak VRAM
GPU
```

예:

```text
Generation completed

Audio: 30.0 sec
GPU: NVIDIA L4

Trim: 0.8 sec
Separation: 8.1 sec
Voice Conversion: 19.4 sec
Mix: 1.2 sec

Total: 29.5 sec
```

**이 benchmark가 확보된 뒤에만 Cloud GPU 선택과 실제 판매 가격을 확정한다.**

---

# Claude Code 실행 지시문

아래 내용까지 Claude Code에 함께 전달한다.

```text
You are the lead engineer for this project.

Read the entire PRD before writing code.

Do not attempt to implement the entire product at once.

First:

1. Analyze the PRD.
2. Identify unclear technical assumptions.
3. Create an implementation plan.
4. Create the repository structure.
5. Implement only Phase 0: the local AI cover generation PoC.
6. Add a benchmark command that measures processing time.
7. Document how to run it in README.md.

Do not implement authentication, payment, database, Explore, or frontend before the audio generation PoC works reliably.

Keep AI model integration behind an interface so Seed-VC can later be replaced with RVC or another model.

After Phase 0 is complete, report:
- what works
- what does not
- GPU VRAM requirements
- average processing time
- estimated cloud GPU cost per 30-second generation
- technical risks
- recommended next phase

Do not over-engineer.
Prefer the simplest implementation that can validate the product.
```

---

## 개발 전 최우선 검증 항목

웹 UI보다 먼저 다음 수치를 확보한다.

```text
30초 생성 1회당 실제 GPU 비용
평균 처리 시간
평균 VRAM 사용량
실패율
샘플 10개 중 사용 가능한 결과 비율
```

예상 판단 기준:

```text
30초 생성 40원 수준 → 매우 좋음
30초 생성 150원 수준 → 충분히 가능
30초 생성 500원 이상 → 모델/인프라 최적화 우선
```

실제 benchmark를 확보한 이후에만 다음을 확정한다.

```text
무료 제공 횟수
전체 곡 가격
Cloud GPU provider
무료/유료 Queue 정책
하루 사용자 제한
```

