"""Ponyo retail pricing derived from an approved supplier wholesale cost."""


def retail_price_for_wholesale_cost(cost_amount: int) -> int:
    """Apply the approved 20% markup to a currency's integer minor units."""
    if cost_amount < 0:
        raise ValueError("Wholesale cost cannot be negative.")
    return (cost_amount * 120 + 50) // 100
