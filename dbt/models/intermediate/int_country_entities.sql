-- BACI country code -> stable country entity used everywhere downstream.
-- Most entities are their ISO3 code. Overrides handle the exceptions: joint reporters before a
-- split (Belgium-Luxembourg, Sudan before 2011, Serbia and Montenegro), non-ISO codes (Taiwan as
-- "Other Asia, nes"), and pre-1995 states with no flows (dropped: blank entity_code).
with countries as (
    select * from {{ ref('stg_baci__countries') }}
),

overrides as (
    select * from {{ ref('country_overrides') }}
),

worldbank as (
    select * from {{ ref('stg_worldbank__countries') }}
),

resolved as (
    select
        countries.baci_code,
        case when overrides.baci_code is null then countries.iso3 else overrides.entity_code end
            as entity_code,
        case when overrides.baci_code is null then countries.iso2 else overrides.iso2 end as iso2,
        case when overrides.baci_code is null then countries.iso3 else overrides.map_iso3 end
            as map_iso3,
        coalesce(overrides.name_en, countries.country_name) as name_en,
        overrides.name_ru,
        overrides.baci_code is not null as is_override,
        overrides.note
    from countries
    left join overrides on countries.baci_code = overrides.baci_code
),

final as (
    select
        resolved.baci_code,
        resolved.entity_code,
        resolved.iso2,
        resolved.map_iso3,
        resolved.name_en,
        resolved.name_ru,
        coalesce(overrides.region, worldbank.region) as region,
        coalesce(overrides.income_group, worldbank.income_group) as income_group,
        resolved.is_override,
        resolved.note
    from resolved
    left join overrides on resolved.baci_code = overrides.baci_code
    left join worldbank on resolved.entity_code = worldbank.iso3
    where resolved.entity_code is not null
)

select * from final
