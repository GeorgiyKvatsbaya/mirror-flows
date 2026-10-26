{{ config(contract={'enforced': true}) }}
-- HS 1992 subheading (HS6) with its heading (HS4), chapter (HS2) and section.
-- Short chapter/section names (EN/RU) come from seeds; official titles from the HS reference.
with products as (
    select * from {{ ref('stg_baci__products') }}
),

hs as (
    select * from {{ ref('stg_hs__codes') }}
),

chapters as (
    select * from {{ ref('hs_chapters') }}
),

sections as (
    select * from {{ ref('hs_sections') }}
),

final as (
    select
        products.hs6::varchar as hs6,
        products.description::varchar as hs6_name,
        left(products.hs6, 4)::varchar as hs4,
        coalesce(heading.description, 'Heading ' || left(products.hs6, 4))::varchar as hs4_name,
        left(products.hs6, 2)::varchar as hs2,
        coalesce(chapters.name_en, chapter.description)::varchar as hs2_name_en,
        chapters.name_ru::varchar as hs2_name_ru,
        sections.section_id::tinyint as section_id,
        sections.roman::varchar as section_roman,
        sections.name_en::varchar as section_name_en,
        sections.name_ru::varchar as section_name_ru
    from products
    left join hs as heading on heading.hs_code = left(products.hs6, 4) and heading.hs_level = 4
    left join hs as chapter on chapter.hs_code = left(products.hs6, 2) and chapter.hs_level = 2
    left join chapters on chapters.chapter = left(products.hs6, 2)
    left join sections
        on left(products.hs6, 2) between sections.first_chapter and sections.last_chapter
)

select * from final
