-- Pickup and drop-off zones, with the wider area each one belongs to.
select zone_id, zone_name, area
from {{ ref('zones') }}
