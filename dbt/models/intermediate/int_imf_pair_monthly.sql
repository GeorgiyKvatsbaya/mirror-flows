{{ config(tags=["monthly"]) }}
-- IMF monthly flows pivoted to one row per reporter x partner x month, partner codes resolved
-- to country entities. 'WLD' holds the reporter's total with the world (IMF G001).
with monthly as (
    select * from {{ ref('stg_imf__trade_monthly') }}
    where month >= '{{ var("imf_first_month") }}'::date
      and (is_world_total or is_partner_country)
),

entities as (
    select distinct entity_code from {{ ref('int_country_entities') }}
),

pivoted as (
    select
        reporter_iso3 as reporter_code,
        case when is_world_total then 'WLD' else counterpart_code end as partner_code,
        month,
        sum(value_usd) filter (where flow = 'export') as exports_usd,
        sum(value_usd) filter (where flow = 'import') as imports_usd
    from monthly
    group by all
)

select pivoted.*
from pivoted
inner join entities as reporter on pivoted.reporter_code = reporter.entity_code
left join entities as partner on pivoted.partner_code = partner.entity_code
where pivoted.partner_code = 'WLD' or partner.entity_code is not null
