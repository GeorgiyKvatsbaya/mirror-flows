-- One row per year x exporter x importer x HS6 product, in US dollars.
with source as (
    select * from {{ source('baci', 'flows') }}
),

renamed as (
    select
        t::smallint as year,
        i::smallint as exporter_code,
        j::smallint as importer_code,
        k as hs6,
        v * 1000 as value_usd,
        q as quantity_t
    from source
)

select * from renamed
