import base64
import binascii
import re
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.shipping import SUPPORTED_SHIPPING_COUNTRIES


class VariantOut(BaseModel):
    id: str
    sku: str
    title: str
    priceAmount: int
    currency: str
    compareAtAmount: int | None = None
    availability: str
    options: dict[str, str] = Field(default_factory=dict)


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    sku: str
    slug: str
    name: str
    description: str
    priceAmount: int = Field(validation_alias="price_amount")
    compareAtAmount: int | None = Field(default=None, validation_alias="compare_at_amount")
    currency: str
    availability: str
    availabilityStatus: str | None = Field(default=None, validation_alias="availability_status")
    variantId: str | None = None
    categoryId: str | None = None
    brandId: str | None = None
    brandName: str | None = None
    makerName: str | None = None
    makerSlug: str | None = None
    makerStory: str | None = None
    makerPhilosophy: str | None = None
    makerProcess: str | None = None
    makerLocation: str | None = None
    makerSpecialties: list[str] = Field(default_factory=list)
    materials: str | None = None
    weightGrams: int | None = None
    editionCount: int | None = None
    estimatedDeliveryDate: date | None = None
    onlyAtPonyo: bool = False
    reservationsOpen: bool = False
    shippingCountries: list[str] | None = None
    images: list[dict[str, str]] = Field(default_factory=list)
    galleryImages: list[dict[str, str]] = Field(default_factory=list)
    categoryName: str = Field(validation_alias="category_name")
    productType: str | None = Field(default=None, validation_alias="product_type")
    supplierName: str = Field(validation_alias="supplier_name")
    image: str = Field(validation_alias="image_url")
    imageAlt: str = Field(validation_alias="image_alt")
    tags: list[str] = Field(default_factory=list)
    sizeTier: str | None = Field(default=None, validation_alias="size_tier")
    dimensions: str | None = None
    dispatchTime: str | None = Field(default=None, validation_alias="dispatch_time")
    variants: list[VariantOut] = Field(default_factory=list)


class ProductListOut(BaseModel):
    data: list[ProductOut]
    page: int
    limit: int
    total: int


class TranslationEntry(BaseModel):
    key: str = Field(min_length=1, max_length=160)
    text: str = Field(min_length=1, max_length=500)


class TranslationBatchRequest(BaseModel):
    locale: str = Field(min_length=2, max_length=12)
    entries: list[TranslationEntry] = Field(min_length=1, max_length=24)


class AuthCredentials(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AdminAccountCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(default="", max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        if not any(character.isdigit() for character in password):
            raise ValueError("Password must include at least one number.")
        if not any(not character.isalnum() for character in password):
            raise ValueError("Password must include at least one special character.")
        return password


class AdminAccountUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(default="", max_length=120)
    email: EmailStr
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str | None) -> str | None:
        if password is None:
            return None
        if not any(character.isdigit() for character in password):
            raise ValueError("Password must include at least one number.")
        if not any(not character.isalnum() for character in password):
            raise ValueError("Password must include at least one special character.")
        return password


class AdminEmailReplyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    idempotencyKey: UUID
    body: str = Field(min_length=1, max_length=5000)


class AdminEmailThreadArchiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    archived: bool


class AdminNewsletterCampaignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    idempotencyKey: UUID
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=10000)

    @field_validator("subject")
    @classmethod
    def normalize_subject(cls, subject: str) -> str:
        normalized = " ".join(subject.split())
        if not normalized:
            raise ValueError("Newsletter subject is required.")
        return normalized


class NewsletterUnsubscribeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    token: str = Field(min_length=20, max_length=4096)


class RegisterRequest(AuthCredentials):
    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(default="", max_length=120)
    marketingOptIn: bool = False

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        if not any(character.isdigit() for character in password):
            raise ValueError("Password must include at least one number.")
        if not any(not character.isalnum() for character in password):
            raise ValueError("Password must include at least one special character.")
        return password


class CustomerOut(BaseModel):
    id: UUID
    firstName: str
    lastName: str
    email: EmailStr
    role: Literal["customer", "supplier", "admin"] = "customer"


class CustomerProfileOut(CustomerOut):
    pass


class CustomerProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(default="", max_length=120)


class CustomerAddressInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(min_length=1, max_length=120)
    address1: str = Field(min_length=1, max_length=240)
    address2: str = Field(default="", max_length=240)
    city: str = Field(min_length=1, max_length=120)
    region: str = Field(default="", max_length=120)
    postalCode: str = Field(min_length=1, max_length=40)
    countryCode: str = Field(min_length=2, max_length=2)
    phone: str = Field(default="", max_length=40)
    isDefault: bool = False


class CustomerAddressOut(CustomerAddressInput):
    id: UUID


class WishlistUpdate(BaseModel):
    productSlugs: list[str] = Field(default_factory=list, max_length=200)


class ProductReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = Field(default="", max_length=140)
    body: str = Field(default="", max_length=3000)
    photos: list[str] = Field(default_factory=list, max_length=4)

    @field_validator("photos")
    @classmethod
    def validate_photos(cls, photos: list[str]) -> list[str]:
        for photo in photos:
            if len(photo) > 550_000 or not photo.startswith("data:image/jpeg;base64,"):
                raise ValueError("Review photos must be optimized JPEG images under 400 KB each.")
            try:
                image_bytes = base64.b64decode(photo.partition(",")[2], validate=True)
            except (binascii.Error, ValueError):
                raise ValueError("One of the review photos is invalid.") from None
            if len(image_bytes) > 400_000 or not image_bytes.startswith(b"\xff\xd8\xff"):
                raise ValueError("Review photos must be valid JPEG images under 400 KB each.")
        return photos


class ProductReservationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: EmailStr
    country: str = Field(min_length=2, max_length=100)


class ProductInterestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: EmailStr
    country: str = Field(min_length=2, max_length=100)


class MakerApplicationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    makerName: str = Field(min_length=1, max_length=180)
    contactPerson: str = Field(min_length=1, max_length=160)
    email: EmailStr
    country: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=1, max_length=120)
    website: AnyHttpUrl | None = Field(default=None, max_length=500)
    socialMedia: AnyHttpUrl | None = Field(default=None, max_length=500)
    productUrl: AnyHttpUrl = Field(max_length=500)
    productDescription: str = Field(min_length=20, max_length=4000)
    provenDesireEvidence: str = Field(min_length=10, max_length=2000)
    materials: str = Field(min_length=2, max_length=2000)
    priceRange: str = Field(min_length=1, max_length=160)
    productPhotos: list[str] = Field(min_length=1, max_length=3)
    ponyoExclusivity: str = Field(min_length=10, max_length=2000)

    @field_validator("productPhotos")
    @classmethod
    def validate_product_photos(cls, photos: list[str]) -> list[str]:
        for photo in photos:
            if len(photo) > 550_000 or not photo.startswith("data:image/jpeg;base64,"):
                raise ValueError("Product photos must be optimized JPEG images under 400 KB each.")
            try:
                image_bytes = base64.b64decode(photo.partition(",")[2], validate=True)
            except (binascii.Error, ValueError):
                raise ValueError("One of the product photos is invalid.") from None
            if len(image_bytes) > 400_000 or not image_bytes.startswith(b"\xff\xd8\xff"):
                raise ValueError("Product photos must be valid JPEG images under 400 KB each.")
        return photos


class ProductWaitlistRequest(BaseModel):
    email: EmailStr
    firstName: str = Field(default="", max_length=120)


class CustomerEnvelope(BaseModel):
    customer: CustomerOut


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        if not any(character.isdigit() for character in password):
            raise ValueError("Password must include at least one number.")
        if not any(not character.isalnum() for character in password):
            raise ValueError("Password must include at least one special character.")
        return password


class EmailVerificationConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=128)


class AcceptedOut(BaseModel):
    accepted: bool = True


class OrderItemOut(BaseModel):
    id: str
    name: str
    image: str
    imageAlt: str = ""
    maker: str = "Ponyo"
    quantity: int
    unitPrice: int
    currency: str


class OrderOut(BaseModel):
    id: UUID
    orderNumber: str
    createdAt: datetime
    status: str
    paymentStatus: str
    fulfillmentStatus: str
    customerEmail: EmailStr
    deliveryAddress: str
    trackingNumber: str | None = None
    trackingCarrier: str | None = None
    totalAmount: int
    currency: str
    items: list[OrderItemOut]


class CheckoutAddress(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    firstName: str = Field(min_length=1, max_length=120)
    lastName: str = Field(min_length=1, max_length=120)
    address1: str = Field(min_length=1, max_length=240)
    address2: str = Field(default="", max_length=240)
    region: str = Field(min_length=1, max_length=120)
    city: str = Field(min_length=1, max_length=120)
    postalCode: str = Field(min_length=1, max_length=40)
    countryCode: str = Field(min_length=2, max_length=2)
    phone: str = Field(min_length=1, max_length=40)

    @field_validator("countryCode")
    @classmethod
    def normalize_country_code(cls, value: str) -> str:
        value = value.upper()
        if value not in {"JP", "KR", "US", "GB", "AU", "CA"}:
            raise ValueError("Shipping is not available for the selected country yet.")
        return value

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, value: str) -> str:
        digits = re.sub(r"\D", "", value)
        if not re.fullmatch(r"\+?[\d\s().-]{7,30}", value) or not 7 <= len(digits) <= 15:
            raise ValueError("Enter a valid phone number, including its country code when possible.")
        return value

    @model_validator(mode="after")
    def validate_postal_code(self):
        patterns = {
            "JP": r"\d{3}-?\d{4}",
            "KR": r"\d{5}",
            "US": r"\d{5}(?:-\d{4})?",
            "GB": r"(?:GIR 0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})",
            "AU": r"\d{4}",
            "CA": r"[A-Z]\d[A-Z][ -]?\d[A-Z]\d",
        }
        if not re.fullmatch(patterns[self.countryCode], self.postalCode, re.IGNORECASE):
            raise ValueError("Enter a valid postal code for the selected country.")
        return self


class CheckoutItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variantId: UUID
    quantity: int = Field(gt=0, le=99, strict=True)
    expectedPriceAmount: int | None = Field(default=None, ge=0, strict=True)
    expectedCurrency: str | None = Field(default=None, min_length=3, max_length=3)


class CheckoutSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotencyKey: UUID | None = None
    email: EmailStr
    shippingAddress: CheckoutAddress
    shippingMethod: str = Field(min_length=1, max_length=64)
    paymentMethod: Literal["card", "paypal", "apple_pay"]
    currency: str = Field(default="JPY", min_length=3, max_length=3)
    items: list[CheckoutItem] = Field(min_length=1, max_length=100)
    successUrl: str
    cancelUrl: str
    couponCode: str | None = Field(default=None, max_length=64)
    expectedTotalAmount: int | None = Field(default=None, ge=0, strict=True)


class OrderCancellationRequest(BaseModel):
    reason: str = Field(default="", max_length=500)


class OrderStatusUpdateRequest(BaseModel):
    status: Literal["shipped", "delivered", "completed"]
    trackingNumber: str | None = Field(default=None, min_length=1, max_length=120)
    trackingCarrier: str | None = Field(default=None, min_length=1, max_length=120)


class ShipmentItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    orderItemId: UUID
    quantity: int = Field(gt=0, le=99, strict=True)


class ShipmentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    carrier: str = Field(min_length=1, max_length=120)
    trackingNumber: str = Field(min_length=1, max_length=180)
    trackingUrl: str | None = Field(default=None, max_length=1000)
    estimatedDeliveryAt: datetime | None = None
    items: list[ShipmentItemInput] = Field(min_length=1, max_length=100)

    @field_validator("trackingUrl")
    @classmethod
    def validate_tracking_url(cls, value: str | None) -> str | None:
        if value is not None:
            from urllib.parse import urlparse

            parsed = urlparse(value)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Tracking URL must be a valid HTTPS URL without embedded credentials.")
        return value


class ShipmentStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["in_transit", "out_for_delivery", "delivered", "exception", "returned"]
    eventId: UUID
    occurredAt: datetime | None = None
    note: str | None = Field(default=None, max_length=500)


class PaymentCaptureRequest(BaseModel):
    # Full capture only: partial captures would need explicit order repricing/fulfillment rules.
    idempotencyKey: UUID


class PaymentRefundRequest(BaseModel):
    idempotencyKey: UUID
    amount: int = Field(gt=0, strict=True)
    reason: Literal["duplicate", "fraudulent", "requested_by_customer"] = "requested_by_customer"


class SupplierDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eventId: UUID
    decision: Literal["confirmed", "rejected"]
    supplierOrderId: str | None = Field(default=None, min_length=1, max_length=180)
    reason: str | None = Field(default=None, max_length=500)


class SupplierAccountRequest(BaseModel):
    customerId: UUID


class AdminProductPublicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    published: bool


class AdminProductReservationSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reservationsOpen: bool
    reservationTarget: int | None = Field(default=None, gt=0, strict=True)


class AdminProductProofRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    materials: str | None = Field(default=None, max_length=3000)
    weightGrams: int | None = Field(default=None, ge=0, strict=True)
    editionCount: int | None = Field(default=None, gt=0, strict=True)
    estimatedDeliveryDate: date | None = None
    onlyAtPonyo: bool | None = None
    shippingCountries: list[str] | None = Field(default=None, max_length=len(SUPPORTED_SHIPPING_COUNTRIES))

    @field_validator("shippingCountries")
    @classmethod
    def validate_shipping_countries(cls, countries: list[str] | None) -> list[str] | None:
        if countries is None:
            return None
        normalized = [country.strip().upper() for country in countries]
        if len(set(normalized)) != len(normalized):
            raise ValueError("Shipping destinations must not contain duplicates.")
        if any(country not in SUPPORTED_SHIPPING_COUNTRIES for country in normalized):
            raise ValueError("Choose only countries supported by checkout.")
        return normalized


class AdminBrandProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    profileImageUrl: AnyHttpUrl | None = None
    makerStory: str | None = Field(default=None, max_length=4000)
    philosophy: str | None = Field(default=None, max_length=3000)
    process: str | None = Field(default=None, max_length=3000)
    location: str | None = Field(default=None, max_length=180)
    specialties: list[str] | None = Field(default=None, max_length=20)
    website: AnyHttpUrl | None = None
    socialMedia: AnyHttpUrl | None = None


class AdminMakerApplicationStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["pending", "reviewing", "accepted", "declined"]


class AdminSupplierStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    active: bool


class SupplierOfferUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    onHand: int = Field(ge=0, strict=True)
    costAmount: int = Field(ge=0, strict=True)
    minimumOrderQuantity: int = Field(gt=0, strict=True)
    leadTimeDays: int = Field(ge=0, strict=True)


class CheckoutSessionOut(BaseModel):
    checkoutUrl: str
    orderId: UUID
    expiresAt: datetime


class CheckoutReceiptOut(BaseModel):
    orderId: UUID
    orderNumber: str
    status: str
    paymentStatus: str
    fulfillmentStatus: str
    totalAmount: int
    currency: str


class NewsletterRequest(BaseModel):
    email: EmailStr


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)
    requestType: str | None = Field(default=None, max_length=80)
