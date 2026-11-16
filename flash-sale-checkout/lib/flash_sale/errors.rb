module FlashSale
  # Every error knows the HTTP status the API should answer with.
  class Error < StandardError
    def status = 400
  end

  class ValidationError < Error
    def status = 422
  end

  class NotFound < Error
    def status = 404
  end

  class InsufficientStock < Error
    def status = 409
  end

  class InvalidState < Error
    def status = 409
  end

  class IdempotencyConflict < Error
    def status = 409
  end

  class HoldExpired < Error
    def status = 410
  end
end
