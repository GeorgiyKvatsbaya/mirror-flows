-- Economies only; regional and income aggregates ("Aggregates") are dropped.
with source as (
    select * from {{ source('worldbank', 'countries') }}
),

renamed as (
    select
        iso3,
        iso2,
        name as country_name,
        region,
        nullif(income_group, 'Not classified') as income_group
    from source
    where not is_aggregate
)

select * from renamed
