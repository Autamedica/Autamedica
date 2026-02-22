export default function StructuredData() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://www.autamedica.com/#organization',
        name: 'AutaMedica',
        url: 'https://www.autamedica.com',
        logo: {
          '@type': 'ImageObject',
          url: 'https://www.autamedica.com/logo.png',
          width: 512,
          height: 512
        },
        description: 'Plataforma de telemedicina sin fricciones con IA médica',
        sameAs: [
          'https://twitter.com/autamedica',
          'https://linkedin.com/company/autamedica'
        ]
      },
      {
        '@type': 'WebSite',
        '@id': 'https://www.autamedica.com/#website',
        url: 'https://www.autamedica.com',
        name: 'AutaMedica',
        description: 'Telemedicina sin fricciones',
        publisher: {
          '@id': 'https://www.autamedica.com/#organization'
        },
        inLanguage: 'es-AR'
      },
      {
        '@type': 'MedicalBusiness',
        '@id': 'https://www.autamedica.com/#business',
        name: 'AutaMedica',
        image: 'https://www.autamedica.com/og-image.png',
        url: 'https://www.autamedica.com',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Buenos Aires',
          addressCountry: 'AR'
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          reviewCount: '250'
        }
      },
      {
        '@type': 'SoftwareApplication',
        name: 'AutaMedica',
        operatingSystem: 'Web, iOS, Android',
        applicationCategory: 'HealthApplication',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'ARS'
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          ratingCount: '250'
        }
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
