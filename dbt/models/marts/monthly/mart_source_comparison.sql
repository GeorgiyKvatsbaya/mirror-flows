-- BACI vs IMF annual exports on the overlap years, per country. The gap is methodology, not
-- error: re-export hubs (Netherlands, Belgium, Singapore, UAE) report transit goods as their own
-- exports, while BACI attributes them to the producing country and reconciles mirror flows.
with baci as (
    select year, entity_code, exports_usd
    from {{ ref('mart_country_year') }}
    where year between year('{{ var("imf_first_month") }}'::date) and {{ var('last_year', 2024) }}
),

imf as (
    select year(month) as year, entity_code, sum(exports_usd) as exports_usd, count(*) as months
    from {{ ref('mart_trade_monthly') }}
    where partner_code = 'WLD'
    group by all
)

select
    baci.year::smallint as year,
    baci.entity_code,
    baci.exports_usd as baci_exports_usd,
    imf.exports_usd as imf_exports_usd,
    {{ safe_divide('imf.exports_usd', 'baci.exports_usd') }} - 1 as imf_vs_baci,
    rank() over (partition by baci.year order by baci.exports_usd desc) as baci_rank
from baci
inner join imf on baci.year = imf.year and baci.entity_code = imf.entity_code
where imf.months = 12
