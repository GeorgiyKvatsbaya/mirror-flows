-- The chapter split must add up both ways: over chapters to the partner totals
-- (mart_country_partner_year) and over partners to the chapter totals (mart_country_chapter_year).
with chapters as (
    select * from {{ ref('mart_country_partner_chapter_year') }}
),

by_partner as (
    select
        year,
        entity_code,
        partner_code,
        sum(exports_usd) as exports_usd,
        sum(imports_usd) as imports_usd
    from chapters
    group by all
),

by_chapter as (
    select
        year,
        entity_code,
        hs2,
        sum(exports_usd) as exports_usd,
        sum(imports_usd) as imports_usd
    from chapters
    group by all
),

partner_gaps as (
    select
        'partner' as check_name,
        partners.year,
        partners.entity_code,
        partners.partner_code as code
    from {{ ref('mart_country_partner_year') }} as partners
    left join by_partner
        on
            partners.year = by_partner.year
            and partners.entity_code = by_partner.entity_code
            and partners.partner_code = by_partner.partner_code
    where
        abs(partners.exports_usd - coalesce(by_partner.exports_usd, 0)) > 1
        or abs(partners.imports_usd - coalesce(by_partner.imports_usd, 0)) > 1
),

chapter_gaps as (
    select
        'chapter' as check_name,
        totals.year,
        totals.entity_code,
        totals.hs2 as code
    from {{ ref('mart_country_chapter_year') }} as totals
    left join by_chapter
        on
            totals.year = by_chapter.year
            and totals.entity_code = by_chapter.entity_code
            and totals.hs2 = by_chapter.hs2
    where
        abs(totals.exports_usd - coalesce(by_chapter.exports_usd, 0)) > 1
        or abs(totals.imports_usd - coalesce(by_chapter.imports_usd, 0)) > 1
)

select * from partner_gaps
union all
select * from chapter_gaps
