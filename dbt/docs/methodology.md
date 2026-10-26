{% docs rca %}
**Revealed comparative advantage (Balassa index).** The share of a product in a country's
exports divided by the share of that product in world exports:

`RCA = (X_cp / X_c) / (X_wp / X_w)`

RCA ≥ 1 means the country exports relatively more of the product than the world as a whole —
a sign of specialisation. Computed at the HS4 heading level from BACI exports.
{% enddocs %}

{% docs hhi %}
**Herfindahl–Hirschman index** of concentration: the sum of squared shares, from 0 (spread
across many partners or products) to 1 (everything in one). Values above ~0.25 are usually
read as highly concentrated. Computed as `Σv² / (Σv)²`.
{% enddocs %}

{% docs fob_cif %}
**FOB vs CIF.** Exports are valued *free on board* (goods at the exporter's border); imports
are usually valued *cost, insurance and freight* (including shipping to the importer). BACI
removes the CIF margin and reports every flow FOB, so a country's imports in BACI are lower
than in its own customs statistics. IMF monthly imports are CIF.
{% enddocs %}

{% docs mirror_flows %}
**Mirror flows.** Every trade flow is reported twice — by the exporter and by the importer —
and the two rarely agree. BACI reconciles them, weighting each reporter by how reliable its
reports have been historically. BACI figures can therefore differ from a country's own
published totals.
{% enddocs %}

{% docs entity_code %}
Country entity code: the ISO 3166 alpha-3 code for current countries; for historical joint
reporters a code of their own (BLX Belgium-Luxembourg until 1998, XSD Sudan until 2011, SCG
Serbia and Montenegro until 2005, ANT Netherlands Antilles until 2010, XSA Southern African
Customs Union until 1999, XEF EFTA n.e.s.). Taiwan is TWN (BACI "Other Asia, nes").
{% enddocs %}
