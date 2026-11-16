module FlashSale
  # Signs event payloads with HMAC-SHA256 so a receiver can prove the event
  # came from us and was not changed on the way.
  module Webhooks
    def self.sign(payload, secret)
      Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", secret, payload))
    end

    # secure_compare takes the same time whether the signature is nearly
    # right or completely wrong, so an attacker cannot guess it byte by byte.
    def self.valid?(payload, signature, secret)
      expected = sign(payload, secret)
      given = signature.to_s
      expected.bytesize == given.bytesize && OpenSSL.secure_compare(expected, given)
    end
  end
end
