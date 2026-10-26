{{ config(contract={'enforced': true}) }}
-- IMF monthly goods trade per reporter x partner ('WLD' = world total), with rolling 12-month
-- sums and the change against the same month a year earlier.
with monthly as (
    select * from {{ ref('int_imf_pair_monthly') }}
),

final as (
    select
        reporter_code::varchar as entity_code,
        partner_code::varchar as partner_code,
        month::date as month,
        exports_usd::double as exports_usd,
        imports_usd::double as imports_usd,
        sum(exports_usd) over rolling_12::double as exports_12m_usd,
        sum(imports_usd) over rolling_12::double as imports_12m_usd,
        ({{ safe_divide('exports_usd', 'max(exports_usd) over year_ago') }} - 1)::double
            as exports_yoy,
        ({{ safe_divide('imports_usd', 'max(imports_usd) over year_ago') }} - 1)::double
            as imports_yoy
    from monthly
    window
        -- Range frames on dates are exact even when a month is missing (lag would shift).
        year_ago as (
            partition by reporter_code, partner_code order by month
            range between interval 12 month preceding and interval 12 month preceding
        ),
        rolling_12 as (
            partition by reporter_code, partner_code order by month
            range between interval 11 month preceding and current row
        )
)

select * from final
