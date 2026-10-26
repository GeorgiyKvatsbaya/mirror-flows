-- HS 1992 hierarchy: level 2 = chapter, 4 = heading, 6 = subheading.
with source as (
    select * from {{ source('hs', 'codes') }}
),

renamed as (
    select
        code as hs_code,
        level::tinyint as hs_level,
        nullif(parent_code, 'TOTAL') as parent_code,
        description
    from source
)

select * from renamed
