with source as (
    select * from {{ source('baci', 'products') }}
),

renamed as (
    select
        code as hs6,
        description
    from source
)

select * from renamed
