#!/usr/bin/env bash
# Create or inspect promo coupons.
#
#   scripts/coupon.sh new RELS5 5 100 "인스타 릴스 DM"   # code, generations, max uses, note
#   scripts/coupon.sh new-batch REELS 5 20               # 20 single-use codes with a prefix
#   scripts/coupon.sh list
#
# Codes are stored upper-case; redeem_coupon() upper-cases whatever the user types.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PW="$(cat "$ROOT/.supabase-db-password")"
REF="$(grep -o 'https://[a-z0-9]*\.supabase\.co' "$ROOT/apps/web/.env.local" | head -1 | sed 's|https://||;s|\.supabase\.co||')"
psql_() { PGPASSWORD="$PW" psql -h aws-0-ap-northeast-2.pooler.supabase.com -p 5432 -U "postgres.$REF" -d postgres -v ON_ERROR_STOP=1 "$@"; }

case "${1:-list}" in
  new)
    CODE="$(echo "${2:?code}" | tr '[:lower:]' '[:upper:]')"
    psql_ -q -c "insert into coupons (code, grants_generations, max_redemptions, note)
              values ('$CODE', ${3:-5}, ${4:-null}, \$\$${5:-}\$\$)
              on conflict (code) do update set grants_generations = excluded.grants_generations,
                max_redemptions = excluded.max_redemptions, note = excluded.note, is_active = true;"
    echo "생성: $CODE"
    ;;
  new-batch)
    PREFIX="$(echo "${2:?prefix}" | tr '[:lower:]' '[:upper:]')"
    GRANTS="${3:-5}"; COUNT="${4:-10}"
    for _ in $(seq 1 "$COUNT"); do
      # Not `tr < /dev/urandom | head`: head closing the pipe kills tr, and pipefail then kills
      # the loop silently. Ambiguous characters are left out so a code survives being read aloud.
      SUFFIX="$(python3 -c "import secrets;print(''.join(secrets.choice('ABCDEFGHJKMNPQRSTUVWXYZ23456789') for _ in range(5)))")"
      CODE="$PREFIX-$SUFFIX"
      psql_ -q -c "insert into coupons (code, grants_generations, max_redemptions, note)
                   values ('$CODE', $GRANTS, 1, 'batch $PREFIX') on conflict do nothing;"
      echo "$CODE"
    done
    ;;
  list)
    psql_ -c "select code, grants_generations as 지급, redeemed_count as 사용,
                     coalesce(max_redemptions::text,'무제한') as 한도,
                     is_active as 활성, coalesce(note,'') as 메모
              from coupons order by created_at desc limit 40;"
    ;;
  *) echo "usage: coupon.sh [new|new-batch|list]" >&2; exit 1 ;;
esac
