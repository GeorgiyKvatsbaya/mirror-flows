-- One row per reporter x flow x counterpart x month. Counterpart G001 is the world total;
-- other G*/GX*/TX* codes are IMF regional aggregates and are flagged, not dropped.
with source as (
    select * from {{ source('imf', 'imts_monthly') }}
),

renamed as (
    select
        reporter as reporter_iso3,
        case indicator
            when 'XG_FOB_USD' then 'export'
            when 'MG_CIF_USD' then 'import'
        end as flow,
        counterpart as counterpart_code,
        strptime(period, '%Y-M%m')::date as month,
        value_usd,
        counterpart = 'G001' as is_world_total,
        regexp_matches(counterpart, '^[A-Z]{3}$') as is_partner_country,
        loaded_at
    from source
)

select * from renamed
