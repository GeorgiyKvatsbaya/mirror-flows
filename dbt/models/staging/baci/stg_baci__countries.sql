with source as (
    select * from {{ source('baci', 'countries') }}
),

renamed as (
    select
        country_code::smallint as baci_code,
        country_name,
        country_iso2 as iso2,
        country_iso3 as iso3
    from source
)

select * from renamed
